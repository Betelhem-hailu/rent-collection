// Opt-in PostgreSQL test. Creates uniquely named fixtures and removes them in
// finally; never falls back to DATABASE_URL or sends a real SMS.
import assert from 'node:assert/strict';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import bcrypt from 'bcrypt';

test('PostgreSQL tenant activation, expiry, throttling and atomic password setup', { skip: !process.env.TEST_DATABASE_URL }, async t => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.DATABASE_POOL_SIZE = '4';
  process.env.JWT_SECRET_KEY = 'activation-integration-test-session-key';
  process.env.JWT_EXPIRATION = '10m';
  const { prisma } = await import('../../shared/database/prisma.service.js');
  const { ActivationRepository } = await import('./activation.repository.js');
  const { ActivationService } = await import('./activation.service.js');
  const { AuthRepository } = await import('./auth.repository.js');
  const { AuthService } = await import('./auth.service.js');
  const { MockSmsGateway } = await import('./gateways/mock-sms.gateway.js');
  const { Temporal } = await import('temporal-polyfill');
  const db = prisma.orm.public;
  const repo = new class extends ActivationRepository {
    override async pendingDeliveries(at: number) {
      const candidates = await super.pendingDeliveries(at);
      const ownRows = await db.TenantActivation.where(row => row.userId.in(ids)).select('challengeId').all();
      return candidates.filter(id => ownRows.some(row => row.challengeId === id));
    }
  }();
  const ids = Array.from({ length: 5 }, () => randomUUID());
  const [tenantId, disabledId, existingId, ownerId] = ids;
  const phones = ids.map(() => '+2519' + randomInt(10000000, 99999999));
  const [phone, disabledPhone, existingPhone, ownerPhone] = phones;
  const propertyId = randomUUID(); const leaseId = randomUUID();
  const rateKey = 'activation-integration:' + randomUUID();
  const password = 'tenant activation phrase with several words';
  let now = Date.now();
  const messages: string[] = [];
  const sms = new MockSmsGateway({ NODE_ENV: 'test', SMS_VERIFICATION_PROVIDER: 'mock' }, message => messages.push(message));
  const service = new ActivationService(repo, sms, () => now);
  let typeId: number | undefined;
  const code = () => messages.at(-1)!.match(/code (\d{6})/)![1];
  const hash = (value: string) => createHash('sha256').update(value).digest('hex');
  async function reset() {
    await db.TenantActivation.where({ userId: tenantId }).deleteAndCount();
    await db.User.where({ id: tenantId }).update({ password: null, authState: 'UNINITIALIZED', isActive: true, phone, phoneVerifiedAt: null });
    now += 16 * 60_000;
  }
  async function start() {
    const result = await service.start(phone);
    await service.dispatchPending();
    return result.challengeId;
  }

  try {
    await prisma.connect();
    for (let i = 0; i < ids.length; i++) await db.User.create({
      id: ids[i], phone: phones[i], name: 'Activation integration fixture', role: i === 3 ? 'LANDLORD' : 'TENANT',
      password: i === 2 ? 'preserve-existing-password' : null, authState: i === 2 ? 'PASSWORD' : 'UNINITIALIZED', isActive: i !== 1,
    });
    await db.Landlord.create({ userId: ownerId });
    typeId = (await db.PropertyType.create({ name: 'Activation integration ' + randomUUID() })).id;
    await db.Property.create({ id: propertyId, landlordId: ownerId, description: 'Activation integration fixture', location: 'Test', rooms: 1, size: '100', propertyTypeId: typeId });
    await db.Lease.create({ id: leaseId, landlordId: ownerId, tenantUserId: tenantId, propertyId, amount: '1000', paymentPeriod: 'MONTHLY', startDate: Temporal.Instant.from('2026-01-01T00:00:00Z'), expireDate: Temporal.Instant.from('2027-01-01T00:00:00Z'), status: 'ACTIVE', gracePeriod: 5, terms: '' });

    await t.test('shared rate limit is atomic and resets after its window', async () => {
      const results = await Promise.all(Array.from({ length: 7 }, () => repo.allowRequest(rateKey, 3, now)));
      assert.equal(results.filter(Boolean).length, 3);
      assert.equal(await repo.allowRequest(rateKey, 3, now + 15 * 60_000), true);
    });

    await t.test('activation preserves identity and leases and allows exactly one password setup', async () => {
      const challenge = await start();
      const before = (await db.User.where({ id: tenantId }).first())!;
      assert.equal(before.password, null);
      assert.equal(before.authState, 'UNINITIALIZED');
      assert.equal((await db.TenantActivation.where({ userId: tenantId }).first())?.deliveryState, 'SENT');
      const actualCode = code();
      const wrongCode = actualCode === '000000' ? '111111' : '000000';
      await assert.rejects(service.verify(challenge, wrongCode), /Invalid or expired/);
      const verified = await service.verify(challenge, actualCode);
      const state = (await db.TenantActivation.where({ userId: tenantId }).first())!;
      assert.equal(state.setupTokenHash, hash(verified.setupToken));
      assert.notEqual(state.setupTokenHash, verified.setupToken);
      await assert.rejects(service.verify(challenge, actualCode), /Invalid or expired/);
      await assert.rejects(service.setPassword(challenge, 'x'.repeat(43), password), /Invalid or expired/);
      const concurrent = await Promise.allSettled([
        service.setPassword(challenge, verified.setupToken, password),
        service.setPassword(challenge, verified.setupToken, 'a different password with several words'),
      ]);
      assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1);
      const after = (await db.User.where({ id: tenantId }).first())!;
      assert.equal(after.id, before.id); assert.equal(after.name, before.name); assert.equal(after.role, before.role);
      assert.equal(after.authState, 'PASSWORD'); assert.ok(after.phoneVerifiedAt);
      assert.equal((await db.Lease.where({ id: leaseId }).first())?.tenantUserId, tenantId);
      assert.equal(await db.TenantActivation.where({ userId: tenantId }).first(), null);
      const chosenPassword = concurrent[0].status === 'fulfilled' ? password : 'a different password with several words';
      assert.equal(await bcrypt.compare(chosenPassword, after.password!), true);
      assert.ok((await new AuthService(new AuthRepository()).login(phone, chosenPassword)).token);
      await assert.rejects(service.setPassword(challenge, verified.setupToken, password), /Invalid or expired/);
    });

    await t.test('disabled users, existing passwords and other roles are never reserved', async () => {
      for (const candidate of [disabledPhone, existingPhone, ownerPhone, '+251900000000']) {
        const response = await service.start(candidate);
        assert.ok(response.challengeId); assert.equal(await db.TenantActivation.where({ challengeId: response.challengeId }).first(), null);
      }
      assert.equal((await db.User.where({ id: existingId }).first())?.password, 'preserve-existing-password');
      assert.equal((await db.User.where({ id: disabledId }).first())?.isActive, false);
    });

    await t.test('resends are limited and invalidate old challenges without resetting attempts', async () => {
      await reset();
      const first = await start();
      const simultaneous = await Promise.all([repo.reserve(phone, now), repo.reserve(phone, now)]);
      assert.deepEqual(simultaneous, [null, null]);
      await assert.rejects(service.verify(first, code() === '000000' ? '111111' : '000000'), /Invalid or expired/);
      now += 60_000;
      const second = await start();
      assert.notEqual(first, second);
      assert.equal((await db.TenantActivation.where({ userId: tenantId }).first())?.attempts, 1);
      await assert.rejects(service.verify(first, code()), /Invalid or expired/);
      now += 60_000; await start();
      now += 60_000; assert.equal(await repo.reserve(phone, now), null);
    });

    await t.test('five failed checks exhaust the window and cannot be bypassed by resending', async () => {
      await reset(); const challenge = await start();
      const actualCode = code(); const wrong = actualCode === '000000' ? '111111' : '000000';
      for (let attempt = 0; attempt < 5; attempt++) await assert.rejects(service.verify(challenge, wrong), /Invalid or expired/);
      await assert.rejects(service.verify(challenge, actualCode), /Invalid or expired/);
      now += 60_000; assert.equal(await repo.reserve(phone, now), null);
      now += 15 * 60_000; assert.ok(await repo.reserve(phone, now));
    });

    await t.test('expired code and setup proof, disabled account and changed phone cannot claim a tenant', async () => {
      await reset(); const expired = await start(); const oldCode = code();
      now += 10 * 60_000;
      await assert.rejects(service.verify(expired, oldCode), /Invalid or expired/);
      await reset(); const challenge = await start(); const proof = await service.verify(challenge, code());
      now += 10 * 60_000;
      await assert.rejects(service.setPassword(challenge, proof.setupToken, password), /Invalid or expired/);
      await reset(); const disabled = await start(); const disabledProof = await service.verify(disabled, code());
      await db.User.where({ id: tenantId }).update({ isActive: false });
      await assert.rejects(service.setPassword(disabled, disabledProof.setupToken, password), /Invalid or expired/);
      await reset(); const changed = await start(); const changedProof = await service.verify(changed, code());
      await db.User.where({ id: tenantId }).update({ phone: '+2518' + randomInt(10000000, 99999999) });
      await assert.rejects(service.setPassword(changed, changedProof.setupToken, password), /Invalid or expired/);
      assert.equal((await db.User.where({ id: tenantId }).first())?.password, null);
    });

    await t.test('delivery reservations survive restarts and only one dispatcher claims each job', async () => {
      await reset(); const reserved = (await repo.reserve(phone, now))!;
      assert.ok((await new ActivationRepository().pendingDeliveries(now)).includes(reserved.challengeId));
      const claims = await Promise.all([repo.claimDelivery(reserved.challengeId, now), new ActivationRepository().claimDelivery(reserved.challengeId, now)]);
      assert.equal(claims.filter(Boolean).length, 1);
      assert.equal(await repo.claimDelivery(reserved.challengeId, now + 29_000), null);
      assert.ok(await repo.claimDelivery(reserved.challengeId, now + 31_000));
      assert.equal(await repo.claimDelivery(reserved.challengeId, now + 62_000), null);
    });
  } finally {
    await prisma.transaction(async tx => {
      await tx.orm.public.TenantActivation.where(row => row.userId.in(ids)).deleteAndCount();
      await tx.orm.public.AuthRateLimit.where({ key: rateKey }).deleteAndCount();
      await tx.orm.public.Lease.where({ id: leaseId }).deleteAndCount();
      await tx.orm.public.Property.where({ id: propertyId }).deleteAndCount();
      await tx.orm.public.Landlord.where({ userId: ownerId }).deleteAndCount();
      await tx.orm.public.User.where(user => user.id.in(ids)).deleteAndCount();
      if (typeId !== undefined) await tx.orm.public.PropertyType.where({ id: typeId }).deleteAndCount();
    }).finally(() => prisma.close());
  }
});
