import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import type { AddressInfo } from 'node:net';
import routes from './landlord.routes.js';

test('all landlord routes reject missing and invalid credentials before accessing data', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', routes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try {
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/landlord`;
    for (const [path, method] of [['/overview','GET'], ['/properties','POST'], ['/tenants','POST'], ['/leases','POST'], ['/leases/other-owner-lease','PATCH']]) {
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
