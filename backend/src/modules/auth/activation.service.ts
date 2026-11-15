import { createHash, randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { PhoneSchema } from '../../shared/phone.js';
import { HttpError } from '../../shared/http.js';
import { ActivationRepository } from './activation.repository.js';
import { createSmsVerification, type SmsVerification } from './sms-verification.js';

export const ActivationStartSchema = z.object({ phone: PhoneSchema });
export const ActivationVerifySchema = z.object({ challengeId: z.uuid(), code: z.string().regex(/^\d{4,10}$/, 'Enter the code from your SMS') });
export const ActivationPasswordSchema = z.object({
  challengeId: z.uuid(), setupToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  password: z.string().min(8, 'Use at least 8 characters').refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be at most 72 UTF-8 bytes'),
});
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const invalidProof = () => new HttpError(400, 'Invalid or expired verification. Request a new code and try again.');

export class ActivationService {
  constructor(
    private readonly repository = new ActivationRepository(),
    private readonly sms: SmsVerification = createSmsVerification(),
    private readonly now = Date.now,
  ) {}

  async throttle(ip: string, action: 'start' | 'verify' | 'password') {
    const limits = { start: 20, verify: 60, password: 30 };
    if (!await this.repository.allowRequest(`tenant-activation:${action}:${hash(ip)}`, limits[action], this.now())) {
      throw new HttpError(429, 'Too many activation requests. Please try again in 15 minutes.');
    }
  }

  async start(phone: string) {
    const normalized = PhoneSchema.parse(phone);
    this.sms.assertConfigured();
    const reserved = await this.repository.reserve(normalized, this.now());
    // Identical responses for unknown, already claimed, disabled and throttled
    // identities. A decoy challenge cannot verify or alter an account.
    const response = { challengeId: reserved?.challengeId ?? randomUUID(), expiresIn: 600, retryAfter: 60,
      message: 'If an eligible tenant account matches this number, an SMS code will be sent. Existing account holders should sign in.' };
    return response;
  }

  // Durable outbox: HTTP responses do not wait for SMS delivery, so provider
  // latency cannot reveal whether a phone belongs to an eligible account.
  async dispatchPending() {
    try { this.sms.assertConfigured(); } catch { return; }
    const pending = await this.repository.pendingDeliveries(this.now());
    for (const challengeId of pending) {
      const reserved = await this.repository.claimDelivery(challengeId, this.now());
      if (!reserved) continue;
      try {
        const sid = await this.sms.start(reserved.phone);
        await this.repository.attachProvider(challengeId, sid, reserved.deliveryAttempt);
      } catch {
        // Never log phone numbers, codes, tokens, or upstream response bodies.
        console.error('Tenant activation SMS could not be sent or recorded.');
        await this.repository.failDelivery(challengeId, reserved.deliveryAttempt);
      }
    }
  }

  async verify(challengeId: string, code: string) {
    this.sms.assertConfigured();
    const attempt = await this.repository.takeAttempt(challengeId, this.now());
    if (!attempt || !await this.sms.check(attempt.phone, attempt.providerSid, code)) throw invalidProof();
    const setupToken = randomBytes(32).toString('base64url');
    if (!await this.repository.saveVerification(challengeId, hash(setupToken), attempt.phone, this.now())) throw invalidProof();
    // This credential authorizes password setup only. It is not a login token.
    return { setupToken, expiresIn: 600 };
  }

  async setPassword(challengeId: string, setupToken: string, password: string) {
    this.sms.assertConfigured();
    const input = ActivationPasswordSchema.parse({ challengeId, setupToken, password });
    const passwordHash = await bcrypt.hash(input.password, 12);
    if (!await this.repository.complete(input.challengeId, hash(input.setupToken), passwordHash, this.now())) throw invalidProof();
    return { message: 'Your tenant account is activated. Sign in with your phone number and new password.' };
  }
}
