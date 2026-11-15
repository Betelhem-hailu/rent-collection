import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { AuthRepository } from './auth.repository.js';

process.env.JWT_SECRET_KEY = 'auth-regression-test-secret';
process.env.JWT_EXPIRATION = '10m';
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';
const { AuthService } = await import('./auth.service.js');
const { createAuthController } = await import('./auth.controller.js');
const { AuthMiddleware } = await import('./auth.middleware.js');
const password = 'Regression!934';
const passwordHash = await bcrypt.hash(password, 4);
const user = { id: 'auth-test-user', name: 'Test User', phone: '+254700000001', password: passwordHash, role: 'TENANT', authState: 'PASSWORD', isActive: true };
const service = (repository: Partial<AuthRepository>) => new AuthService(repository as AuthRepository);

test('login signs an expiring userId token accepted by authentication middleware', async () => {
  const result = await service({ findByPhone: async () => user as never }).login(user.phone, password);
  const payload = jwt.verify(result.token, process.env.JWT_SECRET_KEY!) as jwt.JwtPayload;
  assert.equal(payload.userId, user.id);
  assert.equal(payload.exp! - payload.iat!, 600);
  assert.equal(result.expiresIn, 600);
  const auth = new AuthMiddleware({} as AuthRepository);
  const req = { headers: { authorization: `Bearer ${result.token}` } };
  let continued = false;
  await auth.authenticated(req as never, {} as never, () => { continued = true; });
  assert.equal(continued, true);
  assert.equal((req as typeof req & { userId: string }).userId, user.id);
});

test('login preserves invalid credential and inactive account failures', async () => {
  await assert.rejects(service({ findByPhone: async () => null }).login(user.phone, password), /INVALID_CREDENTIALS/);
  await assert.rejects(service({ findByPhone: async () => user as never }).login(user.phone, 'wrong'), /INVALID_CREDENTIALS/);
  await assert.rejects(service({ findByPhone: async () => ({ ...user, isActive: false }) as never }).login(user.phone, password), /USER_NOT_ACTIVE/);
  await assert.rejects(service({}).login(undefined as never, undefined as never), /INVALID_CREDENTIALS/);
});

test('numeric JWT_EXPIRATION values are seconds rather than milliseconds', async () => {
  const previousExpiration = process.env.JWT_EXPIRATION;
  try {
    process.env.JWT_EXPIRATION = '1000';
    const result = await service({ findByPhone: async () => user as never }).login(user.phone, password);
    const payload = jwt.verify(result.token, process.env.JWT_SECRET_KEY!) as jwt.JwtPayload;
    assert.equal(payload.exp! - payload.iat!, 1000);
    assert.equal(result.expiresIn, 1000);
  } finally {
    process.env.JWT_EXPIRATION = previousExpiration;
  }
});

test('HTTP auth returns a usable session, 401, 403 and detailed validation errors', async () => {
  const subject = service({ findByPhone: async phone => phone === user.phone ? user as never : phone === '+254700000002' ? { ...user, isActive: false } as never : null });
  const controller = createAuthController(subject);
  const app = express();
  app.use(express.json());
  app.post('/login', controller.login);
  app.post('/register', controller.register);
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const post = (path: string, body: unknown) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const login = await post('/login', { phone: user.phone, password });
    assert.equal(login.status, 200);
    const session = (await login.json()).user;
    assert.equal((jwt.verify(session.token, process.env.JWT_SECRET_KEY!) as jwt.JwtPayload).userId, user.id);
    assert.equal((await post('/login', { email: user.phone, password })).status, 200);
    assert.equal((await post('/login', { phone: user.phone, password: 'wrong' })).status, 401);
    assert.equal((await post('/login', {})).status, 401);
    assert.equal((await post('/login', { phone: '+254700000002', password })).status, 403);
    const invalid = await post('/register', {});
    assert.equal(invalid.status, 400);
    assert.equal(typeof (await invalid.json()).error, 'string');
    const duplicate = await post('/register', { name: 'Test User', phone: user.phone, password, businessRole: 'LANDLORD' });
    assert.equal(duplicate.status, 409);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('placeholder accounts cannot sign in or be overwritten through registration', async () => {
  const placeholder = { ...user, password: null, authState: 'UNINITIALIZED' };
  const subject = service({ findByPhone: async () => placeholder as never });
  await assert.rejects(subject.login(user.phone, password), /INVALID_CREDENTIALS/);
  await assert.rejects(subject.register({ name: 'Replacement Name', phone: user.phone, password, businessRole: 'TENANT' }), /PHONE_ALREADY_EXISTS/);
});

test('a concurrent phone reservation returns a registration conflict without replacing the identity', async () => {
  const subject = service({ findByPhone: async () => null, create: async () => { throw new Error('Unique conflict', { cause: { code: '23505' } }); } });
  await assert.rejects(subject.register({ name: 'Registered user', phone: user.phone, password, businessRole: 'TENANT' }), /PHONE_ALREADY_EXISTS/);
});

test('a verified phone token claims the original identity and issues a regular userId session', async () => {
  process.env.TENANT_PHONE_VERIFICATION_SECRET = 'phone-verification-test-secret-independent-of-session-key';
  const proof = jwt.sign({ purpose: 'tenant-phone-login' }, process.env.TENANT_PHONE_VERIFICATION_SECRET, {
    algorithm: 'HS256', issuer: 'digirent-phone-verifier', audience: 'digirent-tenant-login', subject: '+251911234567', expiresIn: '5m',
  });
  let claimed = false;
  const subject = service({
    findByPhone: async phone => { assert.equal(phone, '+251911234567'); return { ...user, authState: 'UNINITIALIZED', password: null } as never; },
    verifyPhoneIdentity: async id => { assert.equal(id, user.id); claimed = true; return user as never; },
  });
  const result = await subject.tenantLogin('0911234567', proof);
  assert.equal(claimed, true);
  assert.equal((jwt.verify(result.token, process.env.JWT_SECRET_KEY!) as jwt.JwtPayload).userId, user.id);
  await assert.rejects(subject.tenantLogin('0911234568', proof), /INVALID_PHONE_VERIFICATION/);
  await assert.rejects(subject.tenantLogin('0911234567', 'invalid-token'), /INVALID_PHONE_VERIFICATION/);
});

test('phone login rejects expired, wrong-purpose, session-key and unconfigured proofs', async () => {
  const secret = process.env.TENANT_PHONE_VERIFICATION_SECRET = 'phone-verification-test-secret-independent-of-session-key';
  const options = { algorithm: 'HS256' as const, issuer: 'digirent-phone-verifier', audience: 'digirent-tenant-login', subject: '+251911234567' };
  const subject = service({ findByPhone: async () => { throw new Error('Invalid proofs must not look up users'); } });
  const proofs = [
    jwt.sign({ purpose: 'tenant-phone-login' }, secret, { ...options, expiresIn: -1 }),
    jwt.sign({ purpose: 'password-reset' }, secret, { ...options, expiresIn: '5m' }),
    jwt.sign({ purpose: 'tenant-phone-login' }, process.env.JWT_SECRET_KEY!, { ...options, expiresIn: '5m' }),
    jwt.sign({ purpose: 'tenant-phone-login' }, secret, options),
    jwt.sign({ purpose: 'tenant-phone-login' }, secret, { ...options, expiresIn: '1h' }),
  ];
  for (const proof of proofs) await assert.rejects(subject.tenantLogin('0911234567', proof), /INVALID_PHONE_VERIFICATION/);
  process.env.TENANT_PHONE_VERIFICATION_SECRET = process.env.JWT_SECRET_KEY;
  await assert.rejects(subject.tenantLogin('0911234567', 'token'), /PHONE_LOGIN_UNAVAILABLE/);
  delete process.env.TENANT_PHONE_VERIFICATION_SECRET;
  await assert.rejects(subject.tenantLogin('0911234567', 'token'), /PHONE_LOGIN_UNAVAILABLE/);
});

test('tenant phone verification cannot enable disabled users or change another business role', async () => {
  const secret = process.env.TENANT_PHONE_VERIFICATION_SECRET = 'phone-verification-test-secret-independent-of-session-key';
  const proof = jwt.sign({ purpose: 'tenant-phone-login' }, secret, { algorithm: 'HS256', issuer: 'digirent-phone-verifier', audience: 'digirent-tenant-login', subject: '+251911234567', expiresIn: '5m' });
  await assert.rejects(service({ findByPhone: async () => ({ ...user, isActive: false }) as never }).tenantLogin('0911234567', proof), /USER_NOT_ACTIVE/);
  await assert.rejects(service({ findByPhone: async () => ({ ...user, role: 'LANDLORD' }) as never }).tenantLogin('0911234567', proof), /INVALID_PHONE_VERIFICATION/);
  delete process.env.TENANT_PHONE_VERIFICATION_SECRET;
});
