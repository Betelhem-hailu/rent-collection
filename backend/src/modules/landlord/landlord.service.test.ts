import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LandlordError, LandlordService } from './landlord.service.js';
import type { LandlordRepository } from './landlord.repository.js';
import { UpdateLeaseSchema, PropertySchema } from './landlord.dto.js';
import { validateLeaseUpdate } from '../lease/lease-update.js';

const service = (repository: Partial<LandlordRepository>) => new LandlordService(repository as LandlordRepository);
const rejects = (status: number) => (error: unknown) => error instanceof LandlordError && error.status === status;

test('property creation accepts optional photo and utilities without requiring them on older requests', async () => {
  const base = { description: 'Riverside Apt 3B', location: 'Addis Ababa', rooms: 1, size: 400, propertyTypeId: 1 };
  assert.deepEqual(PropertySchema.parse(base), base);
  const imageData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
  const subject = service({
    findPropertyType: async () => ({ id: 1, name: 'Apartment' }),
    createProperty: async (owner, data) => {
      assert.equal(owner, 'owner');
      assert.equal(data.imageData, imageData);
      assert.equal(data.utilities, 'Parking\nWater tank');
      assert.equal(data.additionalUtilities, 'Solar hot water');
      return { id: 'home', ...data } as never;
    },
  });
  const result = await subject.createProperty('owner', { ...base, imageData, utilities: ['Parking', 'Water tank', 'Parking'], additionalUtilities: ' Solar hot water ' });
  assert.equal(result.id, 'home');
});

test('property photos reject active content, invalid encoding, wrong raster headers and excessive payloads', () => {
  const base = { description: 'Home', location: 'Addis Ababa', rooms: 1, size: 400, propertyTypeId: 1 };
  for (const imageData of ['data:image/svg+xml;base64,PHN2Zy8+', 'https://example.com/photo.jpg', 'data:image/png;base64,SGVsbG8=', 'data:image/jpeg;base64,***', `data:image/jpeg;base64,${'A'.repeat(700001)}`]) {
    assert.equal(PropertySchema.safeParse({ ...base, imageData }).success, false);
  }
  assert.equal(PropertySchema.safeParse({ ...base, utilities: ['Parking\nInjected utility'] }).success, false);
  assert.equal(PropertySchema.safeParse({ ...base, additionalUtilities: 'A'.repeat(1001) }).success, false);
});

test('landlord billing responses contain calendar dates while receipts retain their time', async () => {
  const payment = { id: 'payment', paymentDate: '2026-01-15T18:20:00Z' };
  const subject = service({
    listProperties: async () => [], listLeases: async () => [], listTenants: async () => [],
    listBillingPeriods: async () => [{ id: 'bill', startPeriod: '2026-01-01T23:30:00Z', endPeriod: '2026-01-31T12:00:00Z' }] as never,
    listPayments: async () => [payment] as never, listPropertyTypes: async () => [],
    findUser: async () => ({ name: 'Owner', isActive: true }),
  });
  const result = await subject.overview('owner');
  assert.deepEqual(result.billingPeriods, [{ id: 'bill', startPeriod: '2026-01-01', endPeriod: '2026-01-31' }]);
  assert.deepEqual(result.payments, [payment]);
});

test('authorization requires an active landlord account', async () => {
  await assert.rejects(service({}).authorize(), rejects(401));
  await assert.rejects(service({ findUser: async () => null }).authorize('owner'), rejects(403));
  await assert.rejects(service({ findUser: async () => ({ name: 'Owner', isActive: true }), findLandlord: async () => null }).authorize('owner'), rejects(403));
});

test('lease updates cannot mutate another landlord property', async () => {
  let wrote = false;
  const subject = service({
    findLease: async () => ({ id: 'lease', landlordId: 'other-owner', propertyId: 'other-property', status: 'ACTIVE', expireDate: '2026-12-31' } as never),
    findOwnedProperty: async () => null,
    updateLease: async () => { wrote = true; return [] as never; },
  });
  await assert.rejects(subject.updateLease('owner', 'lease', { status: 'TERMINATED' }), rejects(404));
  assert.equal(wrote, false);
});

test('ongoing lease dates cannot be shortened and closed leases cannot be changed', async () => {
  let status = 'ACTIVE';
  const subject = service({
    findLease: async () => ({ id: 'lease', landlordId: 'owner', propertyId: 'property', status, startDate: '2026-01-01', expireDate: '2026-12-31', amount: '1000', paymentPeriod: 'MONTHLY' } as never),
    findOwnedProperty: async () => ({ id: 'property' } as never),
  });
  await assert.rejects(subject.updateLease('owner', 'lease', { expireDate: '2026-12-30' }), rejects(400));
  status = 'TERMINATED';
  await assert.rejects(subject.updateLease('owner', 'lease', { expireDate: '2027-12-31' }), rejects(409));
});

test('valid lease patches preserve the response and reach the repository', async () => {
  const subject = service({
    findLease: async () => ({ id: 'lease', landlordId: 'owner', propertyId: 'property', status: 'ACTIVE', startDate: '2026-01-01', expireDate: '2026-12-31', amount: '1000', paymentPeriod: 'MONTHLY' } as never),
    findOwnedProperty: async () => ({ id: 'property' } as never),
    updateLease: async (landlordId, id, patch) => {
      assert.equal(landlordId, 'owner');
      assert.equal(id, 'lease');
      assert.deepEqual(patch, { gracePeriod: 7 });
      return [] as never;
    },
  });
  assert.deepEqual(await subject.updateLease('owner', 'lease', { gracePeriod: 7 }), { success: true });
});

test('lease updates validate supported fields and reject reassignment, empty and mixed termination payloads', () => {
  for (const input of [{}, { terms: 'x', landlordId: 'attacker' }, { propertyId: 'other' }, { tenantUserId: 'other' }, { amount: 100 }, { rentAmount: '0' }, { rentAmount: '1.001' }, { rentAmount: 0.000001 }, { rentAmount: 1.000001 }, { paymentPeriod: 'WEEKLY' }, { startDate: '2027-02-30' }, { gracePeriod: -1 }, { status: 'ACTIVE' }, { status: 'TERMINATED', gracePeriod: 1 }]) {
    assert.equal(UpdateLeaseSchema.safeParse(input).success, false, JSON.stringify(input));
  }
  assert.deepEqual(UpdateLeaseSchema.parse({ rentAmount: '1250.50', paymentPeriod: 'QUARTERLY', terms: '' }), { rentAmount: 1250.5, paymentPeriod: 'QUARTERLY', terms: '' });
});

test('only a not-yet-started lease can change rent, frequency or start date', () => {
  const lease = { status: 'ACTIVE', amount: '1000.00', paymentPeriod: 'MONTHLY', startDate: '2026-12-01', expireDate: '2027-11-30' };
  const current = '2026-11-15';
  assert.equal(validateLeaseUpdate(lease, { rentAmount: 1250.5, paymentPeriod: 'QUARTERLY', startDate: '2026-12-15' }, current).changesSchedule, true);
  for (const startDate of ['2026-11-15', '2026-11-01']) for (const patch of [{ rentAmount: 1250 }, { paymentPeriod: 'YEARLY' as const }, { startDate: '2026-12-01' }]) {
    assert.throws(() => validateLeaseUpdate({ ...lease, startDate }, patch, current), rejects(409));
  }
  assert.throws(() => validateLeaseUpdate(lease, { startDate: current }, current), rejects(400));
});

test('started leases support terms, zero grace days, extension and idempotent unchanged schedule values', () => {
  const lease = { status: 'ACTIVE', amount: '1000.00', paymentPeriod: 'MONTHLY', startDate: '2026-01-01', expireDate: '2026-12-31' };
  const current = '2026-11-15';
  assert.equal(validateLeaseUpdate(lease, { terms: 'Updated terms', gracePeriod: 0, expireDate: '2027-12-31' }, current).changesSchedule, false);
  assert.equal(validateLeaseUpdate(lease, { rentAmount: 1000, paymentPeriod: 'MONTHLY', startDate: lease.startDate, expireDate: lease.expireDate }, current).changesSchedule, false);
  assert.throws(() => validateLeaseUpdate(lease, { expireDate: '2026-11-30' }, current), rejects(400));
  assert.throws(() => validateLeaseUpdate(lease, { expireDate: '2077-01-01' }, current), rejects(400));
  assert.throws(() => validateLeaseUpdate({ ...lease, status: 'EXPIRED' }, { terms: 'new' }, current), rejects(409));
});

test('tenant lookup only searches the landlord roster and normalizes the supplied phone', async () => {
  const subject = service({ listTenants: async landlordId => {
    assert.equal(landlordId, 'owner');
    return [{ id: 'bound', name: 'Bound tenant', phone: '+251911234567' }];
  } });
  assert.equal((await subject.findTenant('owner', { phone: '0911234567' })).id, 'bound');
  await assert.rejects(subject.findTenant('owner', { phone: '0911234568' }), rejects(404));
});

test('a landlord cannot request another landlord tenant roster', async () => {
  const subject = service({ listTenants: async () => { throw new Error('Must not query another roster'); } });
  await assert.rejects(subject.tenants('owner', 'other-owner'), rejects(404));
});
