// Opt-in: temporary fixtures are created in TEST_DATABASE_URL and removed in
// finally. Never use DATABASE_URL implicitly. No external SMS, email or charge.
import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import express from 'express';

test('PostgreSQL landlord lease updates, billing and concurrent bookings', { skip: !process.env.TEST_DATABASE_URL }, async t => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.DATABASE_POOL_SIZE = process.env.LEASE_TEST_POOL_SIZE || '4';
  process.env.JWT_SECRET_KEY = 'lease-update-integration-session-key';
  process.env.JWT_EXPIRATION = '1h';
  const { prisma } = await import('../../shared/database/prisma.service.js');
  const { default: routes } = await import('../../routes/index.js');
  const { errorResponse } = await import('../../shared/http.js');
  const { default: generateToken } = await import('../auth/helper/generateToken.js');
  const { LandlordRepository } = await import('../landlord/landlord.repository.js');
  const { PaymentRepository } = await import('../payment/payment.repository.js');
  const { today, schedule, cents } = await import('../billing/billing.js');
  const { Temporal } = await import('temporal-polyfill');
  const db = prisma.orm.public;
  const repo = new LandlordRepository();
  const users = Array.from({ length: 3 }, () => randomUUID());
  const [owner, otherOwner, tenant] = users;
  const phones = users.map(() => '+2519' + randomInt(10000000, 99999999));
  const properties = [randomUUID(), randomUUID()];
  const leaseIds: string[] = [];
  const checkoutId = randomUUID();
  let typeId: number | undefined;
  const businessDate = today();
  const future = Temporal.PlainDate.from(businessDate).add({ months: 1 }).with({ day: 1 });
  const app = express(); app.use(express.json()); app.use(routes); app.use(errorResponse);
  const server = app.listen(process.env.E2E_BROWSER === 'true' ? 3001 : 0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const token = generateToken(owner);
  const patch = (id: string, body: unknown, as = owner, prefix = '/api/v1/landlord/leases/') => fetch(base + prefix + id, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${generateToken(as)}` }, body: JSON.stringify(body),
  });
  async function create(propertyId: string, start: string, end: string, rentAmount = 1000) {
    const lease = await repo.createLease(owner, { propertyId, tenantName: 'Lease update tenant', tenantPhone: phones[2], rentAmount, paymentPeriod: 'MONTHLY', startDate: start, expireDate: end, gracePeriod: 5, terms: 'Original terms' });
    leaseIds.push(lease.id); return lease;
  }
  try {
    await prisma.connect();
    for (let i = 0; i < users.length; i++) await db.User.create({ id: users[i], name: 'Lease update fixture', phone: phones[i], password: 'not-a-login-hash', role: i === 2 ? 'TENANT' : 'LANDLORD', authState: 'PASSWORD', isActive: true });
    for (const userId of [owner, otherOwner]) await db.Landlord.create({ userId });
    typeId = (await db.PropertyType.create({ name: 'Lease update ' + randomUUID() })).id;
    for (let i = 0; i < properties.length; i++) await db.Property.create({ id: properties[i], description: `Lease update fixture ${i + 1}`, location: 'Integration test', size: '100', rooms: 1, propertyTypeId: typeId, landlordId: owner });
    const planned = await create(properties[0], future.toString(), future.add({ months: 3 }).subtract({ days: 1 }).toString());
    const ongoing = await create(properties[1], Temporal.PlainDate.from(businessDate).with({ day: 1 }).toString(), Temporal.PlainDate.from(businessDate).with({ day: 1 }).add({ months: 2 }).subtract({ days: 1 }).toString(), 900);

    await t.test('only an active owning landlord can update, on every route alias', async () => {
      assert.equal((await patch(planned.id, { terms: 'attack' }, otherOwner)).status, 404);
      assert.equal((await patch(planned.id, { terms: 'attack' }, tenant)).status, 403);
      for (const prefix of ['/api/leases/', '/api/v1/leases/', '/api/lease/', '/api/v1/lease/', '/api/landlord/leases/']) {
        assert.equal((await patch(planned.id, { terms: 'Alias update' }, owner, prefix)).status, 200);
      }
      await db.User.where({ id: owner }).update({ isActive: false });
      assert.equal((await patch(planned.id, { terms: 'disabled' })).status, 403);
      await db.User.where({ id: owner }).update({ isActive: true });
    });

    await t.test('future lease updates preserve identities and recalculate billing atomically', async () => {
      const newStart = future.add({ days: 1 }).toString();
      const end = future.add({ months: 4 }).subtract({ days: 1 }).toString();
      const response = await patch(planned.id, { rentAmount: '1250.50', paymentPeriod: 'QUARTERLY', startDate: newStart, expireDate: end, gracePeriod: 7, terms: 'Updated fixture terms' });
      assert.equal(response.status, 200, JSON.stringify(await response.json()));
      const stored = (await db.Lease.where({ id: planned.id }).first())!;
      assert.equal(stored.landlordId, owner); assert.equal(stored.propertyId, properties[0]); assert.equal(stored.tenantUserId, tenant);
      assert.equal(cents(String(stored.amount)), 125050n); assert.equal(stored.paymentPeriod, 'QUARTERLY');
      assert.equal(stored.gracePeriod, 7); assert.equal(stored.terms, 'Updated fixture terms');
      const bills = await db.BillingPeriod.where({ leaseId: planned.id }).all();
      assert.equal(bills.filter(bill => cents(String(bill.amount)) > 0n).reduce((sum, bill) => sum + cents(String(bill.amount)), 0n), schedule(stored).reduce((sum, bill) => sum + cents(bill.amount), 0n));
      const before = JSON.stringify(stored);
      for (const body of [{ propertyId: properties[1] }, { tenantUserId: otherOwner }, {}, { rentAmount: '1.001' }, { startDate: businessDate }, { startDate: end }, { status: 'TERMINATED', terms: 'mixed' }]) assert.equal((await patch(planned.id, body)).status, 400);
      assert.equal(JSON.stringify(await db.Lease.where({ id: planned.id }).first()), before);
    });

    const stored = (await db.Lease.where({ id: planned.id }).first())!;
    const laterStart = Temporal.PlainDate.from(String(stored.expireDate).slice(0, 10)).add({ months: 2 }).with({ day: 1 });
    const later = await create(properties[0], laterStart.toString(), laterStart.add({ months: 3 }).subtract({ days: 1 }).toString());
    await t.test('overlap checks include concurrent updates to different leases on the property', async () => {
      const gapStart = Temporal.PlainDate.from(String(stored.expireDate).slice(0, 10)).add({ days: 1 });
      const results = await Promise.all([
        patch(planned.id, { expireDate: gapStart.add({ days: 20 }).toString() }),
        patch(later.id, { startDate: gapStart.add({ days: 10 }).toString() }),
      ]);
      assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
      const first = (await db.Lease.where({ id: planned.id }).first())!;
      const second = (await db.Lease.where({ id: later.id }).first())!;
      assert.ok(String(first.expireDate).slice(0, 10) < String(second.startDate).slice(0, 10));
    });

    await t.test('recorded receipts lock financial fields while terms and grace days retain the receipt and allocation', async () => {
      const payment = await new PaymentRepository().create({ leaseId: planned.id, amount: '100.00', transactionRef: 'lease-update-' + randomUUID(), paymentMethod: 'CASH' });
      const allocations = await db.PaymentAllocation.where({ paymentId: payment.id }).all();
      assert.equal((await patch(planned.id, { rentAmount: '1500' })).status, 409);
      assert.equal((await patch(planned.id, { paymentPeriod: 'YEARLY' })).status, 409);
      assert.equal((await patch(planned.id, { terms: 'Keep receipt intact', gracePeriod: 0 })).status, 200);
      assert.deepEqual(await db.PaymentAllocation.where({ paymentId: payment.id }).all(), allocations);
      assert.equal((await db.Payment.where({ id: payment.id }).first())?.transactionRef, payment.transactionRef);
    });

    await t.test('pending checkouts block financial changes and started leases allow only terms, grace and extensions', async () => {
      await db.Checkout.create({ id: checkoutId, leaseId: later.id, tenantUserId: tenant, amount: '10', status: 'PENDING' });
      assert.equal((await patch(later.id, { rentAmount: '1001' })).status, 409);
      await db.Checkout.where({ id: checkoutId }).deleteAndCount();
      for (const body of [{ rentAmount: '901' }, { paymentPeriod: 'QUARTERLY' }, { startDate: future.toString() }]) assert.equal((await patch(ongoing.id, body)).status, 409);
      const end = Temporal.PlainDate.from(String(ongoing.expireDate).slice(0, 10)).add({ months: 1 }).toString();
      assert.equal((await patch(ongoing.id, { terms: 'Ongoing updated terms', gracePeriod: 9, expireDate: end })).status, 200);
      assert.equal((await db.Lease.where({ id: ongoing.id }).first())?.terms, 'Ongoing updated terms');
      assert.equal((await patch(ongoing.id, { expireDate: String(ongoing.expireDate).slice(0, 10) })).status, 400);
    });

    if (process.env.E2E_BROWSER === 'true') await t.test('landlord can save, reopen, and see locked fields in a real browser', async () => {
      const { openBrowser } = await import('../../../scripts/browser.js');
      const browser = await openBrowser();
      const origin = process.env.E2E_APP_URL || 'http://localhost:3000';
      try {
        await browser.navigate(origin + '/login');
        await browser.wait("!!document.querySelector('#login-phone')");
        await browser.evaluate(`sessionStorage.setItem('digirent_token', ${JSON.stringify(token)})`);
        await browser.navigate(origin + '/leases');
        await browser.wait("!!document.querySelector('tbody tr button')");
        const lease = (await db.Lease.where({ id: later.id }).first())!;
        const start = String(lease.startDate).slice(0, 10);
        await browser.evaluate(`(() => { const row = [...document.querySelectorAll('tbody tr')].find(row => row.innerText.includes(${JSON.stringify(start)})); if (!row) throw new Error('Lease row missing'); [...row.querySelectorAll('button')].find(button => button.textContent === 'Update').click(); })()`);
        await browser.wait("!!document.querySelector('#lease-update-rent')");
        assert.equal(await browser.evaluate("document.querySelector('#lease-update-rent').disabled"), false);
        await browser.fill('#lease-update-rent', '1500.75');
        await browser.fill('#lease-update-cycle', 'QUARTERLY');
        await browser.fill('#lease-update-grace', '6');
        await browser.fill('#lease-update-terms', 'Saved through landlord browser');
        await browser.click('Save lease changes');
        await browser.wait("document.body.innerText.includes('Lease updated.')");
        assert.equal(String((await db.Lease.where({ id: later.id }).first())?.amount), '1500.75');
        await browser.click('Close');
        await browser.wait("!document.querySelector('#lease-update-rent')");
        await browser.evaluate(`(() => { const row = [...document.querySelectorAll('tbody tr')].find(row => row.innerText.includes(${JSON.stringify(start)})); [...row.querySelectorAll('button')].find(button => button.textContent === 'Update').click(); })()`);
        await browser.wait("!!document.querySelector('#lease-update-terms')");
        assert.equal(await browser.evaluate("document.querySelector('#lease-update-terms').value"), 'Saved through landlord browser');
        await browser.screenshot('lease-update-saved');
        await browser.click('Close');
        await browser.wait("!document.querySelector('#lease-update-rent')");
        await browser.evaluate("(() => { const row = [...document.querySelectorAll('tbody tr')].find(row => row.innerText.includes('Lease update fixture 2')); [...row.querySelectorAll('button')].find(button => button.textContent === 'Update').click(); })()");
        await browser.wait("!!document.querySelector('#lease-update-rent')");
        for (const field of ['rent', 'cycle', 'start']) assert.equal(await browser.evaluate(`document.querySelector('#lease-update-${field}').disabled`), true);
        for (const field of ['end', 'grace', 'terms']) assert.equal(await browser.evaluate(`document.querySelector('#lease-update-${field}').disabled`), false);
        await browser.screenshot('lease-update-ongoing');
        assert.deepEqual(browser.errors, []);
      } finally { await browser.close(); }
    });
    await t.test('terminated leases reject later edits', async () => {
      assert.equal((await patch(ongoing.id, { status: 'TERMINATED' })).status, 200);
      assert.equal((await patch(ongoing.id, { terms: 'must fail' })).status, 409);
    });
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await prisma.transaction(async tx => {
      const tables = tx.orm.public;
      const payments = await tables.Payment.where(payment => payment.leaseId.in(leaseIds)).select('id').all();
      if (payments.length) await tables.PaymentAllocation.where(allocation => allocation.paymentId.in(payments.map(payment => payment.id))).deleteAndCount();
      await tables.Payment.where(payment => payment.leaseId.in(leaseIds)).deleteAndCount();
      await tables.Checkout.where(checkout => checkout.leaseId.in(leaseIds)).deleteAndCount();
      await tables.BillingPeriod.where(bill => bill.leaseId.in(leaseIds)).deleteAndCount();
      await tables.Lease.where(lease => lease.id.in(leaseIds)).deleteAndCount();
      await tables.Property.where(property => property.id.in(properties)).deleteAndCount();
      await tables.Landlord.where(landlord => landlord.userId.in(users)).deleteAndCount();
      await tables.User.where(user => user.id.in(users)).deleteAndCount();
      if (typeId !== undefined) await tables.PropertyType.where({ id: typeId }).deleteAndCount();
    }).finally(() => prisma.close());
  }
});
