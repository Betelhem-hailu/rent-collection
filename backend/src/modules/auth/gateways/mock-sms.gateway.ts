import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { SmsUnavailableError, type SmsVerification } from '../sms-verification.js';

const digest = (phone: string, nonce: string, code: string) => createHash('sha256').update(`${phone}:${nonce}:${code}`).digest();

// Local development only. Nothing is sent to a handset. This adapter changes
// delivery, while the database still enforces expiry, attempts and consumption.
export class MockSmsGateway implements SmsVerification {
  constructor(private readonly env = process.env, private readonly log: (message: string) => void = console.info) {}

  assertConfigured() {
    if (this.env.SMS_VERIFICATION_PROVIDER !== 'mock' || !['development', 'test'].includes(this.env.NODE_ENV || 'development')) {
      throw new SmsUnavailableError();
    }
  }

  async start(phone: string) {
    this.assertConfigured();
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const nonce = randomUUID();
    this.log(`[MOCK SMS - no message sent] Phone ending ${phone.slice(-4)}: activation code ${code}`);
    return `mock:${nonce}:${digest(phone, nonce, code).toString('hex')}`;
  }

  async check(phone: string, verificationSid: string, code: string) {
    this.assertConfigured();
    const [prefix, nonce, expected] = verificationSid.split(':');
    if (prefix !== 'mock' || !nonce || !/^[a-f0-9]{64}$/.test(expected ?? '')) return false;
    return timingSafeEqual(Buffer.from(expected, 'hex'), digest(phone, nonce, code));
  }
}
