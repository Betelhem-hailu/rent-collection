import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import type { AddressInfo } from 'node:net';
import paymentRoutes from './payment.routes.js';
import { createPaymentController } from './payment.controller.js';
import { PaymentError, type PaymentService } from './payment.service.js';
import { CreatePaymentSchema } from './payment.dto.js';

async function withServer(app: ReturnType<typeof express>, run: (url: string) => Promise<void>) {
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test('payment routes require authentication and webhook remains unimplemented', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', paymentRoutes);
  await withServer(app, async url => {
    for (const [path, method] of [['/payments', 'GET'], ['/payments/payment-1', 'GET'], ['/payments', 'POST']]) {
      const response = await fetch(`${url}/api/v1${path}`, { method });
      assert.equal(response.status, 401);
    }
    const webhook = await fetch(`${url}/api/v1/payments/payment-1/webhook`, { method: 'POST' });
    assert.equal(webhook.status, 501);
  });
});

test('controller returns list, detail, create, validation and conflict responses', async () => {
  const payment = { id: 'payment-1', amount: '50.00' };
  const service = {
    async list() { return [payment]; },
    async getById(_userId: unknown, id: string) {
      if (id === 'missing') throw new PaymentError(404, 'Payment not found');
      return payment;
    },
    async create(_userId: unknown, input: unknown) {
      const data = CreatePaymentSchema.parse(input);
      if (data.transactionRef === 'duplicate') throw new PaymentError(409, 'Transaction reference already exists');
      return payment;
    },
  } as unknown as PaymentService;
  const controller = createPaymentController(service);
  const app = express();
  app.use(express.json());
  app.get('/payments', controller.list);
  app.get('/payments/:id', controller.getById);
  app.post('/payments', controller.create);
  await withServer(app, async url => {
    const list = await fetch(`${url}/payments`);
    assert.equal(list.status, 200);
    assert.deepEqual(await list.json(), { payments: [payment] });
    const detail = await fetch(`${url}/payments/payment-1`);
    assert.equal(detail.status, 200);
    assert.deepEqual(await detail.json(), { payment });
    assert.equal((await fetch(`${url}/payments/missing`)).status, 404);
    const input = { leaseId: 'lease-1', amount: '50.00', transactionRef: 'receipt-1', paymentMethod: 'CASH' };
    const post = (body: unknown) => fetch(`${url}/payments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const created = await post(input);
    assert.equal(created.status, 201);
    assert.deepEqual(await created.json(), { payment });
    const invalid = await post({ ...input, amount: -1 });
    assert.equal(invalid.status, 400);
    assert.equal(typeof (await invalid.json()).error, 'string');
    assert.equal((await post({ ...input, transactionRef: 'duplicate' })).status, 409);
  });
});
