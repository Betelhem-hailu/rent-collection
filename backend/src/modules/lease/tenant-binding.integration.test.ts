// Opt-in only: TEST_DATABASE_URL must point to a dedicated, migrated PostgreSQL
// database. Never fall back to the application's DATABASE_URL for this suite.
import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { test } from 'node:test';

test('PostgreSQL concurrent reservation, rollback, tenant isolation and phone claim', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.DATABASE_POOL_SIZE = '4';
  process.env.NODE_ENV = 'test';
  const { prisma } = await import('../../shared/database/prisma.service.js');
  const { LandlordRepository } = await import('../landlord/landlord.repository.js');
  const { LandlordService } = await import('../landlord/landlord.service.js');
  const { TenantService, NO_ACTIVE_LEASE_MESSAGE } = await import('../tenant/tenant.service.js');
  const { TenantRepository } = await import('../tenant/tenant.repository.js');
  const { AuthRepository } = await import('../auth/auth.repository.js');
  const { today } = await import('../billing/billing.js');
  const { Temporal } = await import('temporal-polyfill');
  const db = prisma.orm.public;
  const subject = new LandlordService(new LandlordRepository());
  const owners = [randomUUID(), randomUUID()];
  const existingId = randomUUID();
  const propertyIds = Array.from({ length: 5 }, () => randomUUID());
  const phones = Array.from({ length: 6 }, () => '+2519' + randomInt(10000000, 99999999));
  let typeId: number | undefined;
  try {
    await prisma.connect();
    for (let i = 0; i < owners.length; i++) {
      await db.User.create({ id: owners[i], phone: phones[i], name: 'Binding test landlord', role: 'LANDLORD', authState: 'PASSWORD', password: 'not-a-login-hash', isActive: true });
      await db.Landlord.create({ userId: owners[i] });
    }
    await db.User.create({ id: existingId, phone: phones[2], name: 'Existing global name', role: 'TENANT', authState: 'PASSWORD', password: 'preserve-this-value', isActive: true });
    typeId = (await db.PropertyType.create({ name: 'Binding test ' + randomUUID() })).id;
    for (let i = 0; i < propertyIds.length; i++) await db.Property.create({ id: propertyIds[i], landlordId: i === 4 ? owners[1] : owners[0], description: 'Binding test property', location: 'Test only', size: '100', rooms: 2, isActive: true, propertyTypeId: typeId });
    const startDate = Temporal.PlainDate.from(today()).with({ day: 1 }).toString();
    const expireDate = Temporal.PlainDate.from(startDate).add({ months: 2 }).subtract({ days: 1 }).toString();
    const details = { rentAmount: 5000, startDate, expireDate };
    const leases = await Promise.all(propertyIds.slice(0, 2).map(id => subject.handleLeaseTenantBinding(owners[0], id, 'Reserved tenant', phones[3], details)));
    assert.equal(leases[0].tenantUserId, leases[1].tenantUserId);
    assert.equal((await db.User.where({ phone: phones[3] }).all()).length, 1);
    assert.equal((await db.BillingPeriod.where({ leaseId: leases[0].id }).all()).length, 2);
    await assert.rejects(subject.handleLeaseTenantBinding(owners[1], propertyIds[2], 'Unauthorized tenant', phones[4], details), { status: 404 });
    assert.equal(await db.User.where({ phone: phones[4] }).first(), null);
    await assert.rejects(prisma.transaction(async tx => {
      const transactional = new LandlordService(new LandlordRepository({ transaction: work => work(tx) } as never));
      await transactional.handleLeaseTenantBinding(owners[0], propertyIds[2], 'Rolled back tenant', phones[5], details);
      throw new Error('Force rollback');
    }), /Force rollback/);
    assert.equal(await db.User.where({ phone: phones[5] }).first(), null);
    assert.equal((await db.Lease.where({ propertyId: propertyIds[2] }).all()).length, 0);
    await subject.handleLeaseTenantBinding(owners[1], propertyIds[4], 'Different supplied name', phones[2], details);
    assert.equal((await db.User.where({ id: existingId }).first())?.name, 'Existing global name');
    assert.equal((await db.User.where({ id: existingId }).first())?.password, 'preserve-this-value');
    assert.deepEqual((await subject.tenants(owners[0], owners[0])).map(tenant => tenant.id), [leases[0].tenantUserId]);
    assert.deepEqual((await subject.tenants(owners[1], owners[1])).map(tenant => tenant.id), [existingId]);
    await assert.rejects(subject.findTenant(owners[0], { phone: phones[2] }), { status: 404 });
    const tenantId = leases[0].tenantUserId;
    await new AuthRepository().verifyPhoneIdentity(tenantId);
    const portal = await new TenantService(new TenantRepository()).overview(tenantId);
    assert.equal(portal.leases.length, 2);
    assert.ok(portal.leases.every(lease => lease.tenantUserId === tenantId));
    for (const lease of leases) await subject.updateLease(owners[0], lease.id, { status: 'TERMINATED' });
    const emptyPortal = await new TenantService(new TenantRepository()).overview(tenantId);
    assert.equal(emptyPortal.message, NO_ACTIVE_LEASE_MESSAGE);
    assert.deepEqual(emptyPortal.payments, []);
    assert.equal((await subject.tenants(owners[0], owners[0])).length, 1, 'historical tenant remains in the landlord roster');
  } finally {
    await prisma.transaction(async tx => {
      const tables = tx.orm.public;
      const leases = await tables.Lease.where(lease => lease.propertyId.in(propertyIds)).select('id').all();
      const ids = leases.map(lease => lease.id);
      if (ids.length) {
        await tables.BillingPeriod.where(bill => bill.leaseId.in(ids)).deleteAndCount();
        await tables.Lease.where(lease => lease.id.in(ids)).deleteAndCount();
      }
      await tables.Property.where(property => property.id.in(propertyIds)).deleteAndCount();
      await tables.Landlord.where(landlord => landlord.userId.in(owners)).deleteAndCount();
      await tables.User.where(user => user.phone.in(phones)).deleteAndCount();
      if (typeId !== undefined) await tables.PropertyType.where({ id: typeId }).deleteAndCount();
    }).finally(() => prisma.close());
  }
});
