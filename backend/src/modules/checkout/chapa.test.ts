import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac } from 'node:crypto';
import { Chapa, validWebhook } from './chapa.js';

test('Chapa verifies reference, ETB amount, mode and successful status', async () => {
  const saved = { key: process.env.CHAPA_SECRET_KEY, mode: process.env.CHAPA_MODE };
  process.env.CHAPA_SECRET_KEY = 'local-test-key'; process.env.CHAPA_MODE = 'test';
  try {
    let details = { tx_ref: 'rent_test', currency: 'ETB', amount: '250.50', mode: 'test', status: 'success', reference: 'provider-ref' };
    const chapa = new Chapa(async (url, options) => {
      assert.equal(String(url), 'https://api.chapa.co/v1/transaction/verify/rent_test');
      assert.equal((options!.headers as Record<string, string>).Authorization, 'Bearer local-test-key');
      return Response.json({ status: 'success', data: details });
    });
    assert.deepEqual(await chapa.verify('rent_test', '250.50'), { paid: true, reference: 'provider-ref' });
    for (const mismatch of [{ currency: 'USD' }, { amount: '250.51' }, { mode: 'live' }, { tx_ref: 'other' }]) {
      const original = details; details = { ...details, ...mismatch };
      await assert.rejects(chapa.verify('rent_test', '250.50'), /match/); details = original;
    }
    details.status = 'pending';
    assert.equal((await chapa.verify('rent_test', '250.50')).paid, false);
  } finally {
    if (saved.key === undefined) delete process.env.CHAPA_SECRET_KEY; else process.env.CHAPA_SECRET_KEY = saved.key;
    if (saved.mode === undefined) delete process.env.CHAPA_MODE; else process.env.CHAPA_MODE = saved.mode;
  }
});
test('Chapa checkout rejects untrusted provider URLs and handles provider failures', async () => {
  process.env.CHAPA_SECRET_KEY = 'local-test-key';
  let link = 'https://checkout.chapa.co/pay/test';
  const chapa = new Chapa(async (_url, options) => {
    const payload = JSON.parse(String(options?.body));
    assert.equal(payload.currency, 'ETB'); assert.equal(payload.tx_ref, 'rent_test');
    return Response.json({ status: 'success', data: { checkout_url: link } });
  });
  assert.equal(await chapa.initialize({ id: 'rent_test', amount: '10', email: 'test@example.test', name: 'Test Tenant' }), link);
  link = 'https://chapa.co.evil.example/pay';
  await assert.rejects(chapa.initialize({ id: 'rent_test', amount: '10', email: 'test@example.test', name: 'Test Tenant' }), /invalid checkout link/);
  await assert.rejects(new Chapa(async () => { throw new Error('network'); }).verify('rent_test', '10'), /Unable to reach Chapa/);
});
test('webhooks validate signatures against the original bytes', () => {
  process.env.CHAPA_WEBHOOK_SECRET = 'test-webhook-secret';
  const raw = Buffer.from('{"tx_ref":"rent_test"}');
  const signature = createHmac('sha256', process.env.CHAPA_WEBHOOK_SECRET).update(raw).digest('hex');
  assert.equal(validWebhook(raw, { payload: signature }), true);
  assert.equal(validWebhook(Buffer.from('{"tx_ref":"forged"}'), { payload: signature }), false);
  assert.equal(validWebhook(raw, { payload: 'invalid' }), false);
  assert.equal(validWebhook(raw, {}), false);
  const legacy = createHmac('sha256', process.env.CHAPA_WEBHOOK_SECRET).update(process.env.CHAPA_WEBHOOK_SECRET).digest('hex');
  assert.equal(validWebhook(raw, { chapa: legacy }), true);
});
