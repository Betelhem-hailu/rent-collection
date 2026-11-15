import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LandlordRepository } from '../landlord/landlord.repository.js';
import { LandlordService } from '../landlord/landlord.service.js';
import { PhoneSchema } from '../../shared/phone.js';

// A transactional store exercises the real repository and billing logic without
// connecting unit tests to DATABASE_URL. PostgreSQL integration is tested separately.
function fixture() {
  let state: Record<string, any[]> = {
    User: [{ id: 'owner', role: 'LANDLORD', isActive: true }, { id: 'other-owner', role: 'LANDLORD', isActive: true }],
    Landlord: [{ userId: 'owner' }, { userId: 'other-owner' }],
    Property: [{ id: 'home', landlordId: 'owner', isActive: true }, { id: 'second-home', landlordId: 'owner', isActive: true }],
    Lease: [], BillingPeriod: [], Payment: [], PaymentAllocation: [],
  };
  let failBilling = false;
  let queue = Promise.resolve();
  const database = {
    async transaction(work: (tx: any) => Promise<unknown>) {
      const previous = queue;
      let release!: () => void;
      queue = new Promise<void>(resolve => { release = resolve; });
      await previous;
      const draft = structuredClone(state);
      const tables = Object.fromEntries(Object.keys(draft).map(name => {
        const query = (predicates: ((row: any) => boolean)[] = [], selected: string[] = []) => {
          const matches = () => draft[name].filter(row => predicates.every(predicate => predicate(row)));
          const fields = new Proxy({}, { get: (_, key: string) => ({ in: (values: unknown[]) => (row: any) => values.includes(row[key]) }) });
          const project = (row: any) => !row ? null : selected.length ? Object.fromEntries(selected.map(key => [key, row[key]])) : { ...row };
          return {
            where(filter: any) {
              const predicate = typeof filter === 'function' ? filter(fields) : (row: any) => Object.entries(filter).every(([key, value]) => row[key] === value);
              return query([...predicates, predicate], selected);
            },
            select(...keys: string[]) { return query(predicates, keys); },
            async all() { return matches().map(project); },
            async first() { return project(matches()[0]); },
            async update(values: any) { return matches().map(row => Object.assign(row, values)); },
            async create(values: any) {
              if (failBilling && name === 'BillingPeriod') throw new Error('Billing write failed');
              const row = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value && typeof value === 'object' ? String(value) : value]));
              draft[name].push(row); return { ...row };
            },
            async upsert({ conflictOn, create, update }: any) {
              const row = draft[name].find(row => Object.entries(conflictOn).every(([key, value]) => row[key] === value));
              if (row) return { ...Object.assign(row, update) };
              draft[name].push({ ...create }); return { ...create };
            },
            async deleteAndCount() { const remove = matches(); draft[name] = draft[name].filter(row => !remove.includes(row)); return remove.length; },
          };
        };
        return [name, query()];
      }));
      try { const result = await work({ orm: { public: tables } }); state = draft; return result; }
      finally { release(); }
    },
  };
  const repository = new LandlordRepository(database as never);
  return { subject: new LandlordService(repository), state: () => state, failBilling: () => { failBilling = true; } };
}

const details = { rentAmount: 5000, startDate: '2026-01-01', expireDate: '2026-03-31', paymentPeriod: 'MONTHLY', gracePeriod: 5 };

test('Ethiopian phone spellings reserve the same E.164 identity', () => {
  for (const phone of ['0911234567', '911234567', '+251 911 234 567', '00251911234567', '251911234567']) assert.equal(PhoneSchema.parse(phone), '+251911234567');
  for (const phone of ['', '123', 'not-a-phone', '+2519x1234567']) assert.equal(PhoneSchema.safeParse(phone).success, false);
});

test('a new phone creates one uninitialized user, an owned lease and billing atomically', async () => {
  const f = fixture();
  const lease = await f.subject.handleLeaseTenantBinding('owner', 'home', 'Abebe Bekele', '0911234567', details);
  const tenant = f.state().User.find(user => user.phone === '+251911234567');
  assert.ok(tenant);
  assert.equal(tenant.password, null);
  assert.equal(tenant.authState, 'UNINITIALIZED');
  assert.equal(tenant.role, 'TENANT');
  assert.equal(lease.tenantUserId, tenant.id);
  assert.equal(lease.landlordId, 'owner');
  assert.equal(f.state().BillingPeriod.length, 3);
});

test('existing accounts keep their global name and credentials', async () => {
  const f = fixture();
  f.state().User.push({ id: 'existing', phone: '+251911234567', name: 'Registered Name', role: 'TENANT', password: 'existing-hash', authState: 'PASSWORD', isActive: true });
  const lease = await f.subject.handleLeaseTenantBinding('owner', 'home', 'Different supplied name', '+251911234567', details);
  assert.equal(lease.tenantUserId, 'existing');
  assert.equal(f.state().User.length, 3);
  assert.equal(f.state().User[2].name, 'Registered Name');
  assert.equal(f.state().User[2].password, 'existing-hash');
});

test('binding an existing user preserves their global business role', async () => {
  const f = fixture();
  f.state().User[1].phone = '+251911234567';
  const lease = await f.subject.handleLeaseTenantBinding('owner', 'home', 'Another customer name', '0911234567', details);
  assert.equal(lease.tenantUserId, 'other-owner');
  assert.equal(f.state().User[1].role, 'LANDLORD');
  assert.equal(f.state().User.length, 2);
});

test('unauthorized properties and inactive landlords cannot reserve phones', async () => {
  const f = fixture();
  await assert.rejects(f.subject.handleLeaseTenantBinding('other-owner', 'home', 'Abebe Bekele', '0911234567', details), { status: 404 });
  f.state().User[0].isActive = false;
  await assert.rejects(f.subject.handleLeaseTenantBinding('owner', 'home', 'Abebe Bekele', '0911234567', details), { status: 403 });
  assert.equal(f.state().User.length, 2);
  assert.equal(f.state().Lease.length, 0);
});

test('billing failure rolls back the reserved user and lease', async () => {
  const f = fixture(); f.failBilling();
  await assert.rejects(f.subject.handleLeaseTenantBinding('owner', 'home', 'Abebe Bekele', '0911234567', details), /Billing write failed/);
  assert.equal(f.state().User.length, 2);
  assert.equal(f.state().Lease.length, 0);
  assert.equal(f.state().BillingPeriod.length, 0);
});

test('overlap rejection does not leave behind a second reserved phone', async () => {
  const f = fixture();
  await f.subject.handleLeaseTenantBinding('owner', 'home', 'Abebe Bekele', '0911234567', details);
  await assert.rejects(f.subject.handleLeaseTenantBinding('owner', 'home', 'Another tenant', '0911234568', details), { status: 409 });
  assert.equal(f.state().User.length, 3);
  assert.equal(f.state().Lease.length, 1);
});

test('concurrent bindings on different properties reuse the global phone identity', async () => {
  const f = fixture();
  const leases = await Promise.all(['home', 'second-home'].map(property => f.subject.handleLeaseTenantBinding('owner', property, 'Abebe Bekele', '0911234567', details)));
  assert.equal(leases[0].tenantUserId, leases[1].tenantUserId);
  assert.equal(f.state().User.length, 3);
  assert.equal(f.state().Lease.length, 2);
});

test('malformed binding inputs fail before any database mutation', async () => {
  const f = fixture();
  for (const change of [{ rentAmount: -1 }, { expireDate: '2025-01-01' }, { startDate: '2026-02-30' }]) {
    await assert.rejects(f.subject.handleLeaseTenantBinding('owner', 'home', 'Abebe Bekele', '0911234567', { ...details, ...change }));
  }
  assert.equal(f.state().User.length, 2);
});
