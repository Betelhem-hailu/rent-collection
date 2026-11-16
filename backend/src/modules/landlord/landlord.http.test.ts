import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import type { AddressInfo } from 'node:net';
import routes from './landlord.routes.js';
import apiRoutes from '../../routes/index.js';
import { LandlordService } from './landlord.service.js';
import { createLandlordController } from './landlord.controller.js';
import type { LandlordRepository } from './landlord.repository.js';

test('all landlord routes reject missing and invalid credentials before accessing data', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', routes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try {
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/landlord`;
    for (const [path, method] of [['/overview','GET'], ['/properties','POST'], ['/properties/home','PATCH'], ['/properties/home/image','PATCH'], ['/tenants','POST'], ['/leases','POST'], ['/leases/other-owner-lease','PATCH']]) {
      for (const authorization of ['', 'Bearer invalid-token']) {
        const response = await fetch(url + path, { method, headers: authorization ? { authorization } : {} });
        assert.equal(response.status, 401, `${method} ${path}`);
        assert.ok((await response.json()).message);
      }
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve,reject) => server.close(e => e ? reject(e) : resolve()));
  }
});

test('all new B2B endpoints require a session on both supported API prefixes', async () => {
  const app = express(); app.use(express.json()); app.use(apiRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    for (const prefix of ['/api', '/api/v1']) for (const [path, method] of [['/property/home', 'PATCH'], ['/property/home/image', 'PATCH'], ['/landlord/properties/home', 'PATCH'], ['/landlord/properties/home/image', 'PATCH'], ['/leases', 'POST'], ['/leases/lease-id', 'PATCH'], ['/lease/lease-id', 'PATCH'], ['/landlord/leases/lease-id', 'PATCH'], ['/landlords/owner/tenants', 'GET'], ['/tenant/portal', 'GET']]) {
      assert.equal((await fetch(base + prefix + path, { method })).status, 401, `${method} ${prefix}${path}`);
    }
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('property update controllers enforce ownership and keep information and photo payloads separate', async () => {
  const subject = new LandlordService({
    findOwnedProperty: async (id, owner) => id === 'home' && owner === 'owner' ? { id } as never : null,
    updatePropertyInfo: async (_id, _owner, patch) => { assert.equal(patch.description, 'Updated home'); assert.equal('imageData' in patch, false); },
    updatePropertyImage: async (_id, _owner, imageData) => { assert.equal(imageData, null); },
  } as unknown as LandlordRepository);
  const controller = createLandlordController(subject);
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { (req as typeof req & { userId: string }).userId = 'owner'; next(); });
  app.patch('/properties/:id', controller.updatePropertyInfo);
  app.patch('/properties/:id/image', controller.updatePropertyImage);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/properties`;
    for (const [path, body, status] of [
      ['/home', { description: 'Updated home' }, 200], ['/home/image', { imageData: null }, 200],
      ['/unowned', { description: 'Updated home' }, 404], ['/unowned/image', { imageData: null }, 404],
      ['/home', { description: 'Updated home', imageData: null }, 400], ['/home/image', { imageData: null, description: 'Updated home' }, 400],
    ] as const) {
      const response = await fetch(base + path, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      assert.equal(response.status, status, path);
      if (status === 200) assert.deepEqual(await response.json(), { success: true });
    }
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('lease creation ignores client-supplied landlord and tenant user IDs', async () => {
  const subject = new LandlordService({ createLease: async (landlordId, input) => {
    assert.equal(landlordId, 'authenticated-owner');
    assert.equal(input.tenantPhone, '+251911234567');
    assert.equal('landlordId' in input, false);
    assert.equal('tenantUserId' in input, false);
    return { id: 'new-lease', landlordId, tenantUserId: 'resolved-on-server' } as never;
  } } as unknown as LandlordRepository);
  const controller = createLandlordController(subject);
  const app = express(); app.use(express.json());
  app.post('/api/leases', (req, res) => { (req as typeof req & { userId: string }).userId = 'authenticated-owner'; return controller.createLease(req, res); });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/leases`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      landlordId: 'other-owner', tenantUserId: 'unrelated-user', propertyId: 'owned-home', tenantName: 'Abebe Bekele', tenantPhone: '0911234567', amount: '5000.00', startDate: '2026-01-01', expireDate: '2026-12-31',
    }) });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).lease.tenantUserId, 'resolved-on-server');
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
