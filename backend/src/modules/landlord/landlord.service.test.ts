import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LandlordError, LandlordService } from './landlord.service.js';
import type { LandlordRepository } from './landlord.repository.js';

const service = (repository: Partial<LandlordRepository>) => new LandlordService(repository as LandlordRepository);
const rejects = (status: number) => (error: unknown) => error instanceof LandlordError && error.status === status;

test('authorization requires an active landlord account', async () => {
  await assert.rejects(service({}).authorize(), rejects(401));
  await assert.rejects(service({ findUser: async () => null }).authorize('owner'), rejects(403));
  await assert.rejects(service({ findUser: async () => ({ name: 'Owner', isActive: true }), findLandlord: async () => null }).authorize('owner'), rejects(403));
});

test('lease updates cannot mutate another landlord property', async () => {
  let wrote = false;
  const subject = service({
    findLease: async () => ({ id: 'lease', propertyId: 'other-property', status: 'ACTIVE', expireDate: '2026-12-31' } as never),
    findOwnedProperty: async () => null,
    updateLease: async () => { wrote = true; return [] as never; },
  });
  await assert.rejects(subject.updateLease('owner', 'lease', { status: 'TERMINATED' }), rejects(404));
  assert.equal(wrote, false);
});

test('renewal requires an active lease and a later end date', async () => {
  let status = 'ACTIVE';
  const subject = service({
    findLease: async () => ({ id: 'lease', propertyId: 'property', status, expireDate: '2026-12-31' } as never),
    findOwnedProperty: async () => ({ id: 'property' } as never),
  });
  await assert.rejects(subject.updateLease('owner', 'lease', { expireDate: '2026-12-31' }), rejects(400));
  status = 'TERMINATED';
  await assert.rejects(subject.updateLease('owner', 'lease', { expireDate: '2027-12-31' }), rejects(409));
});

test('valid lease patches preserve the response and reach the repository', async () => {
  const subject = service({
    findLease: async () => ({ id: 'lease', propertyId: 'property', status: 'ACTIVE', expireDate: '2026-12-31' } as never),
    findOwnedProperty: async () => ({ id: 'property' } as never),
    updateLease: async (id, patch) => {
      assert.equal(id, 'lease');
      assert.deepEqual(patch, { gracePeriod: 7 });
      return [] as never;
    },
  });
  assert.deepEqual(await subject.updateLease('owner', 'lease', { gracePeriod: 7 }), { success: true });
});
