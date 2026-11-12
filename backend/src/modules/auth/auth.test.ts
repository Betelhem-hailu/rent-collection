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
const user = { id: 'auth-test-user', name: 'Test User', phone: '+254700000001', password: passwordHash, role: 'USER', isActive: true };
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
