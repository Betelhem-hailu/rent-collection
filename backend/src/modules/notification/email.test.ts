import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import { SMTPServer } from 'smtp-server';
import { emailTransport } from './email.js';

test('SMTP captures a reminder locally, reports recipient rejection and allows a retry', async () => {
  process.env.NODE_ENV = 'test'; process.env.SMTP_HOST = '127.0.0.1'; process.env.SMTP_FROM = 'rent@example.test';
  process.env.SMTP_SECURE = 'false'; process.env.SMTP_REQUIRE_TLS = 'false';
  delete process.env.SMTP_USER; delete process.env.SMTP_PASSWORD;
  const messages: string[] = [];
  let reject = true;
  const server = new SMTPServer({ secure: false, authOptional: true, disabledCommands: ['AUTH', 'STARTTLS'], onRcptTo(_address, _session, callback) { callback(reject ? new Error('Test recipient rejection') : undefined); }, onData(stream, _session, callback) { let message = ''; stream.on('data', chunk => { message += chunk; }); stream.on('end', () => { messages.push(message); callback(); }); } });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  process.env.SMTP_PORT = String((server.server.address() as AddressInfo).port);
  const { transport, from } = emailTransport();
  try {
    const mail = { from, to: 'tenant@example.test', subject: 'Overdue rent reminder', text: 'Your overdue rent is ETB 749.50.' };
    await assert.rejects(transport.sendMail(mail));
    assert.equal(messages.length, 0);
    reject = false;
    const delivered = await transport.sendMail(mail);
    assert.ok(delivered.accepted.includes('tenant@example.test'));
    assert.equal(messages.length, 1);
    assert.ok(messages[0]!.includes('ETB 749.50'));
  } finally { transport.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
test('incomplete SMTP configuration returns a clear unavailable response', () => {
  delete process.env.SMTP_HOST;
  assert.throws(emailTransport, /not configured/);
  process.env.SMTP_HOST = '127.0.0.1'; process.env.SMTP_PORT = 'invalid';
  assert.throws(emailTransport, /Invalid email configuration/);
});
