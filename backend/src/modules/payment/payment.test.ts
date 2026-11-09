import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PaymentRepository } from './payment.repository.js';
import { PaymentError, PaymentService } from './payment.service.js';
import { CreatePaymentSchema } from './payment.dto.js';

const input = {
  leaseId: 'lease-1', amount: '1250.50', transactionRef: 'receipt-1',
  paymentMethod: 'CASH', paymentDate: '2026-11-09T12:00:00Z',
};

function setup() {
  const state = { role: 'USER', active: true, owner: 'owner-1', tenant: 'tenant-1', duplicate: false, race: false, created: false, missing: false };
  let recorded: unknown;
  let listed: unknown;
  const repository = {
    async findUser(id: string) { return { id, role: state.role, isActive: state.active }; },
    async findLease() { return { id: 'lease-1', propertyId: 'property-1', tenantId: state.tenant }; },
    async findProperty() { return { landlordId: state.owner }; },
    async findAccessibleLeaseIds() { return ['lease-1']; },
    async list(query: unknown, ids?: string[]) { listed = { query, ids }; return []; },
    async findById() { return state.missing ? null : { id: 'payment-1', leaseId: 'lease-1' }; },
    async findByTransactionRef() { return state.duplicate ? { id: 'payment-1' } : null; },
    async create(data: unknown) {
      if (state.race) throw { cause: { code: '23505' } };
      state.created = true;
      recorded = data;
      return { id: 'payment-1' };
    },
  };
  return { state, service: new PaymentService(repository as unknown as PaymentRepository), recorded: () => recorded, listed: () => listed };
}

const status = (expected: number) => (error: unknown) => error instanceof PaymentError && error.status === expected;

test('validates amounts, dates, methods and required fields', () => {
  assert.equal(CreatePaymentSchema.parse({ ...input, amount: 12.5 }).amount, '12.5');
  for (const amount of ['0', '-1', 'NaN', '1.001', 0, -1, Infinity]) {
    assert.equal(CreatePaymentSchema.safeParse({ ...input, amount }).success, false);
  }
  assert.equal(CreatePaymentSchema.safeParse({ ...input, paymentDate: 'invalid' }).success, false);
  assert.equal(CreatePaymentSchema.safeParse({ ...input, paymentMethod: 'CARD' }).success, false);
  assert.equal(CreatePaymentSchema.safeParse({ ...input, leaseId: '' }).success, false);
});

test('records received payment for the property owner without changing decimal precision', async () => {
  const context = setup();
  assert.deepEqual(await context.service.create('owner-1', input), { id: 'payment-1' });
  assert.deepEqual(context.recorded(), input);
});

test('rejects unauthenticated and inactive users', async () => {
  const { service, state } = setup();
  await assert.rejects(service.list(undefined, {}), status(401));
  state.active = false;
  await assert.rejects(service.list('owner-1', {}), status(403));
});

test('tenants may read their payments but cannot record a payment as received', async () => {
  const { service, state } = setup();
  assert.equal((await service.getById('tenant-1', 'payment-1')).id, 'payment-1');
  await assert.rejects(service.create('tenant-1', input), status(403));
  assert.equal(state.created, false);
});

test('unrelated users cannot read or write payments', async () => {
  const { service, state } = setup();
  await assert.rejects(service.getById('stranger', 'payment-1'), status(403));
  await assert.rejects(service.create('stranger', input), status(403));
  assert.equal(state.created, false);
});

test('list scopes normal users to accessible leases and applies pagination defaults', async () => {
  const context = setup();
  await context.service.list('tenant-1', {});
  assert.deepEqual(context.listed(), { query: { limit: 50, offset: 0 }, ids: ['lease-1'] });
});

test('admins may record payments and list all leases', async () => {
  const context = setup();
  context.state.role = 'ADMIN';
  await context.service.create('admin-1', input);
  await context.service.list('admin-1', {});
  assert.deepEqual(context.listed(), { query: { limit: 50, offset: 0 }, ids: undefined });
});

test('returns 404 for a missing payment', async () => {
  const { service, state } = setup();
  state.missing = true;
  await assert.rejects(service.getById('owner-1', 'missing'), status(404));
});

test('duplicate references return 409 before writing and during a concurrent insert', async () => {
  const { service, state } = setup();
  state.duplicate = true;
  await assert.rejects(service.create('owner-1', input), status(409));
  assert.equal(state.created, false);
  state.duplicate = false;
  state.race = true;
  await assert.rejects(service.create('owner-1', input), status(409));
});
