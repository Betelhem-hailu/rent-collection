import { MockSmsGateway } from './gateways/mock-sms.gateway.js';
import { TwilioSmsVerification } from './gateways/twilio-sms.gateway.js';

export interface SmsVerification {
  assertConfigured(): void;
  start(phone: string): Promise<string>;
  check(phone: string, verificationSid: string, code: string): Promise<boolean>;
}

export class SmsUnavailableError extends Error {
  constructor() { super('SMS verification is temporarily unavailable. Please try again later.'); }
}

export function createSmsVerification(env = process.env): SmsVerification {
  if (env.SMS_VERIFICATION_PROVIDER === 'mock') return new MockSmsGateway(env);
  if (env.SMS_VERIFICATION_PROVIDER === 'twilio') return new TwilioSmsVerification(env);
  return {
    assertConfigured() { throw new SmsUnavailableError(); },
    async start() { throw new SmsUnavailableError(); },
    async check() { throw new SmsUnavailableError(); },
  };
}
