import { SmsUnavailableError, type SmsVerification } from '../sms-verification.js';

// A managed Verify service owns OTP generation, delivery, expiry and checking.
// No development bypass, fixed code, or credential-bearing URL is exposed.
export class TwilioSmsVerification implements SmsVerification {
  constructor(private readonly env = process.env, private readonly request: typeof fetch = fetch) {}

  assertConfigured() {
    const usingApiKey = !!(this.env.TWILIO_API_KEY || this.env.TWILIO_API_SECRET);
    const validCredentials = usingApiKey
      ? /^SK[\da-f]{32}$/i.test(this.env.TWILIO_API_KEY ?? '') && !!this.env.TWILIO_API_SECRET
      : !!this.env.TWILIO_AUTH_TOKEN;
    if (!/^VA[\da-f]{32}$/i.test(this.env.TWILIO_VERIFY_SERVICE_SID ?? '')
      || !/^AC[\da-f]{32}$/i.test(this.env.TWILIO_ACCOUNT_SID ?? '')
      || !validCredentials) {
      throw new SmsUnavailableError();
    }
  }

  private async post(resource: string, data: Record<string, string>) {
    this.assertConfigured();
    const username = this.env.TWILIO_API_KEY || this.env.TWILIO_ACCOUNT_SID;
    const password = this.env.TWILIO_API_KEY ? this.env.TWILIO_API_SECRET : this.env.TWILIO_AUTH_TOKEN;
    try {
      const response = await this.request(`https://verify.twilio.com/v2/Services/${this.env.TWILIO_VERIFY_SERVICE_SID}/${resource}`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(data),
      });
      // Expired, consumed or attempt-exhausted verifications are not valid.
      if (resource === 'VerificationCheck' && [400, 404, 429].includes(response.status)) return null;
      if (!response.ok) throw new SmsUnavailableError();
      return await response.json() as { sid?: string; status?: string; to?: string; service_sid?: string; channel?: string };
    } catch { throw new SmsUnavailableError(); }
  }

  async start(phone: string) {
    const result = await this.post('Verifications', { To: phone, Channel: 'sms' });
    if (!result || result.status !== 'pending' || result.to !== phone || result.channel !== 'sms'
      || result.service_sid !== this.env.TWILIO_VERIFY_SERVICE_SID || !/^VE[\da-f]{32}$/i.test(result.sid ?? '')) throw new SmsUnavailableError();
    return result.sid!;
  }

  async check(phone: string, verificationSid: string, code: string) {
    const result = await this.post('VerificationCheck', { VerificationSid: verificationSid, Code: code });
    return !!result && result.status === 'approved' && result.to === phone
      && result.sid === verificationSid && result.channel === 'sms' && result.service_sid === this.env.TWILIO_VERIFY_SERVICE_SID;
  }
}
