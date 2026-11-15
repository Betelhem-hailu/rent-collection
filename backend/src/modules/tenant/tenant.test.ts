import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { TenantService, NO_ACTIVE_LEASE_MESSAGE } from './tenant.service.js';
import type { TenantRepository } from './tenant.repository.js';
import { createTenantRouter } from './tenant.routes.js';
import { errorResponse } from '../../shared/http.js';

const emptyData = { properties: [], landlords: [], billingPeriods: [], payments: [], checkouts: [], notifications: [] };
const service = (repository: Partial<TenantRepository>) => new TenantService(repository as TenantRepository);
const user = { id: 'tenant', role: 'TENANT', isActive: true, authState: 'PHONE_VERIFIED' };

test('tenant billing responses contain dates without shifting them across timezones', async () => {
  const payment = { id: 'payment', paymentDate: '2026-01-15T18:20:00Z' };
  const subject = service({
    findUser: async () => user as never, listLeases: async () => [],
    rentalData: async () => ({ ...emptyData, billingPeriods: [{ id: 'bill', startPeriod: '2026-01-01T00:01:00+14:00', endPeriod: '2026-01-31T23:59:59-12:00' }], payments: [payment] }) as never,
  });
  const result = await subject.overview(user.id);
  assert.deepEqual(result.billingPeriods, [{ id: 'bill', startPeriod: '2026-01-01', endPeriod: '2026-01-31' }]);
  assert.deepEqual(result.payments, [payment]);
});

test('portal scopes every data lookup to the authenticated tenant active leases', async () => {
  const lease = { id: 'lease', propertyId: 'home', landlordId: 'owner', tenantUserId: user.id };
  const subject = service({
    findUser: async id => { assert.equal(id, user.id); return user as never; },
    listLeases: async (id, activeOnly) => { assert.equal(id, user.id); assert.equal(activeOnly, true); return [lease] as never; },
    rentalData: async (id, leases) => { assert.equal(id, user.id); assert.deepEqual(leases, [lease]); return emptyData; },
  });
  const result = await subject.overview(user.id);
  assert.equal(result.hasActiveLease, true);
  assert.deepEqual(result.leases, [lease]);
});

test('tenants without active leases receive the exact clean state', async () => {
  const subject = service({ findUser: async () => user as never, listLeases: async () => [], rentalData: async (_, leases) => { assert.deepEqual(leases, []); return emptyData; } });
  const result = await subject.overview(user.id);
  assert.equal(result.hasActiveLease, false);
  assert.equal(result.message, NO_ACTIVE_LEASE_MESSAGE);
  assert.deepEqual(result.payments, []);
});

test('portal rejects unsigned, inactive, uninitialized and non-tenant accounts', async () => {
  await assert.rejects(service({}).overview(undefined), { status: 401 });
  for (const change of [{ isActive: false }, { authState: 'UNINITIALIZED' }, { role: 'LANDLORD' }]) {
    await assert.rejects(service({ findUser: async () => ({ ...user, ...change }) as never, listLeases: async () => [] }).overview(user.id), { status: 403 });
  }
});

test('HTTP portal ignores client-supplied tenant identifiers', async () => {
  const subject = service({ findUser: async id => { assert.equal(id, user.id); return user as never; }, listLeases: async id => { assert.equal(id, user.id); return []; }, rentalData: async () => emptyData });
  const app = express();
  app.use('/api', createTenantRouter(subject, (req, _res, next) => { (req as typeof req & { userId: string }).userId = user.id; next(); }));
  app.use(errorResponse);
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise<void>(resolve => server.once('listening', resolve));
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/tenant/portal?tenantUserId=someone-else&phone=0911999999`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).message, NO_ACTIVE_LEASE_MESSAGE);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
