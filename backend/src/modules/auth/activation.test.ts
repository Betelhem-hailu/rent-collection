import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import bcrypt from 'bcrypt';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { ActivationRepository } from './activation.repository.js';
import type { SmsVerification } from './sms-verification.js';

process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';
const { MockSmsGateway } = await import('./gateways/mock-sms.gateway.js');
const { TwilioSmsVerification } = await import('./gateways/twilio-sms.gateway.js');
const { createSmsVerification } = await import('./sms-verification.js');
const { ActivationService, ActivationPasswordSchema } = await import('./activation.service.js');
const { createActivationRouter } = await import('./activation.routes.js');
const { errorResponse } = await import('../../shared/http.js');
const phone = '+251911234567';
const challengeId = randomUUID();
const password = 'a tenant password with several words';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const gateway: SmsVerification = { assertConfigured() {}, async start() { return 'provider-id'; }, async check() { return true; } };
const subject = (repository: Partial<ActivationRepository>, sms: SmsVerification = gateway) => new ActivationService(repository as ActivationRepository, sms, () => 1000);

test('mock gateway generates random codes, binds them to a phone and is blocked in production', async () => {
  const messages: string[] = [];
  const mock = new MockSmsGateway({ SMS_VERIFICATION_PROVIDER: 'mock', NODE_ENV: 'test' }, message => messages.push(message));
  const sid = await mock.start(phone);
  const code = messages[0].match(/code (\d{6})/)![1];
  assert.equal(await mock.check(phone, sid, code), true);
  assert.equal(await mock.check('+251911234568', sid, code), false);
  assert.equal(await mock.check(phone, sid, 'invalid'), false);
  assert.equal(await mock.check(phone, 'not-a-mock-reference', code), false);
  assert.match(sid, /^mock:[a-f0-9-]{36}:[a-f0-9]{64}$/);
  assert.equal(messages[0].includes(phone), false);
  assert.notEqual(await mock.start(phone), sid);
  const production = new MockSmsGateway({ SMS_VERIFICATION_PROVIDER: 'mock', NODE_ENV: 'production' }, () => assert.fail('Must not log codes'));
  assert.throws(() => production.assertConfigured(), /unavailable/);
  await assert.rejects(production.start(phone), /unavailable/);
  assert.throws(() => createSmsVerification({}).assertConfigured(), /unavailable/);
});

test('Twilio adapter sends form requests and accepts approval only for the bound service, phone and verification', async () => {
  const env = { TWILIO_ACCOUNT_SID: 'AC' + '1'.repeat(32), TWILIO_VERIFY_SERVICE_SID: 'VA' + '2'.repeat(32), TWILIO_AUTH_TOKEN: 'test-token' };
  const sid = 'VE' + '3'.repeat(32);
  const responses: Record<string, unknown>[] = [];
  const requests: { url: string; options: RequestInit }[] = [];
  const request = (async (url, options) => {
    requests.push({ url: String(url), options: options! });
    return Response.json(responses.shift());
  }) as typeof fetch;
  const twilio = new TwilioSmsVerification(env, request);
  const result = { sid, service_sid: env.TWILIO_VERIFY_SERVICE_SID, to: phone, channel: 'sms' };
  responses.push({ ...result, status: 'pending' });
  assert.equal(await twilio.start(phone), sid);
  assert.equal(new URLSearchParams(String(requests[0].options.body)).get('To'), phone);
  assert.equal(new URLSearchParams(String(requests[0].options.body)).get('Channel'), 'sms');
  responses.push({ ...result, status: 'approved' });
  assert.equal(await twilio.check(phone, sid, '123456'), true);
  assert.equal(new URLSearchParams(String(requests[1].options.body)).get('VerificationSid'), sid);
  for (const patch of [{ status: 'pending' }, { to: '+251911234568' }, { service_sid: 'other' }, { sid: 'other' }, { channel: 'email' }]) {
    responses.push({ ...result, status: 'approved', ...patch });
    assert.equal(await twilio.check(phone, sid, '123456'), false);
  }
  const expired = new TwilioSmsVerification(env, (async () => new Response(null, { status: 404 })) as typeof fetch);
  assert.equal(await expired.check(phone, sid, '123456'), false);
  const unavailable = new TwilioSmsVerification(env, (async () => { throw new Error('sensitive provider error'); }) as typeof fetch);
  await assert.rejects(unavailable.start(phone), error => (error as Error).message.includes('unavailable') && !(error as Error).message.includes('sensitive'));
});

test('requesting activation returns a generic response and defers delivery', async () => {
  const sms = { ...gateway, async start() { assert.fail('Delivery must not block HTTP'); return ''; } };
  const existing = await subject({ reserve: async normalized => { assert.equal(normalized, phone); return { userId: 'same-user', phone, challengeId }; } }, sms).start('0911234567');
  const unknown = await subject({ reserve: async () => null }, sms).start(phone);
  assert.deepEqual({ ...existing, challengeId: '' }, { ...unknown, challengeId: '' });
  assert.match(unknown.challengeId, /^[a-f0-9-]{36}$/);
  assert.equal('code' in existing, false);
});

test('verified code issues a password-only credential and stores its hash', async () => {
  let stored = '';
  const service = subject({
    takeAttempt: async () => ({ phone, providerSid: 'provider-id' }),
    saveVerification: async (_id, tokenHash, verifiedPhone) => { stored = tokenHash; assert.equal(verifiedPhone, phone); return true; },
  });
  const result = await service.verify(challengeId, '123456');
  assert.equal(result.setupToken.length, 43);
  assert.equal(stored, digest(result.setupToken));
  assert.equal('token' in result, false);
  await assert.rejects(subject({ takeAttempt: async () => null }).verify(challengeId, '123456'), /Invalid or expired/);
  await assert.rejects(subject({ takeAttempt: async () => ({ phone, providerSid: 'id' }) }, { ...gateway, async check() { return false; } }).verify(challengeId, '123456'), /Invalid or expired/);
});

test('password setup hashes the chosen password and cannot create a login session', async () => {
  const setupToken = 'a'.repeat(43);
  const service = subject({ complete: async (id, tokenHash, passwordHash) => {
    assert.equal(id, challengeId); assert.equal(tokenHash, digest(setupToken));
    assert.notEqual(passwordHash, password); assert.equal(await bcrypt.compare(password, passwordHash), true);
    return true;
  } });
  const result = await service.setPassword(challengeId, setupToken, password);
  assert.equal('token' in result, false);
  assert.match(result.message, /Sign in/);
  assert.equal(ActivationPasswordSchema.safeParse({ challengeId, setupToken, password: 'short' }).success, false);
  assert.equal(ActivationPasswordSchema.safeParse({ challengeId, setupToken, password: 'x'.repeat(73) }).success, false);
  assert.equal(ActivationPasswordSchema.safeParse({ challengeId, setupToken, password: 'é'.repeat(37) }).success, false);
  await assert.rejects(subject({ complete: async () => false }).setPassword(challengeId, setupToken, password), /Invalid or expired/);
});

test('HTTP activation validates input, sets no-store, throttles and hides unavailable provider details', async () => {
  let limited = false;
  const service = subject({ allowRequest: async () => !limited, reserve: async () => null });
  const app = express();
  app.use(express.json()); app.use('/activation', createActivationRouter(service)); app.use(errorResponse);
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise<void>(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/activation`;
    const post = (path: string, body: unknown) => fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const response = await post('/start', { phone });
    assert.equal(response.status, 202); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await post('/start', { phone: 'invalid' })).status, 400);
    assert.equal((await post('/verify', { challengeId, code: 'letters' })).status, 400);
    assert.equal((await post('/password', { challengeId, setupToken: 'x'.repeat(43), password: 'short' })).status, 400);
    limited = true;
    assert.equal((await post('/start', { phone })).status, 429);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
