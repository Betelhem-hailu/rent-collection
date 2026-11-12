import { createHmac, timingSafeEqual } from 'node:crypto';
import { HttpError } from '../../shared/http.js';
import { cents } from '../billing/billing.js';

export function chapaMode() {
  const mode = process.env.CHAPA_MODE || 'test';
  if (mode !== 'test' && mode !== 'live') throw new HttpError(503, 'Payment service has an invalid mode');
  return mode;
}
export function paymentConfig() {
  const secret = process.env.CHAPA_SECRET_KEY;
  if (!secret) throw new HttpError(503, 'Online payments are not configured. Please contact your landlord.');
  const base = process.env.CHAPA_API_URL || 'https://api.chapa.co/v1';
  const url = new URL(base);
  const localTest = process.env.NODE_ENV === 'test' && ['127.0.0.1', 'localhost'].includes(url.hostname);
  if (!localTest && (url.protocol !== 'https:' || url.hostname !== 'api.chapa.co')) throw new HttpError(503, 'Invalid payment API configuration');
  return { secret, base: base.replace(/\/$/, ''), mode: chapaMode(), localTest };
}

export class Chapa {
  constructor(private request: typeof fetch = fetch) {}
  private async call(path: string, body?: unknown) {
    const config = paymentConfig();
    let response: Response;
    try {
      response = await this.request(config.base + path, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${config.secret}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000), redirect: 'error' });
    } catch { throw new HttpError(502, 'Unable to reach Chapa. Please try again.'); }
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.status !== 'success' || !data.data) throw new HttpError(502, 'Chapa could not process the request. Please try again.');
    return data.data;
  }
  async initialize(input: { id: string; amount: string; email: string; name: string }) {
    const origin = process.env.APP_URL || 'http://localhost:3000';
    const callbackOrigin = process.env.PUBLIC_API_URL || origin;
    const data = await this.call('/transaction/initialize', {
      tx_ref: input.id, amount: input.amount, currency: 'ETB', email: input.email,
      first_name: input.name.split(' ')[0], last_name: input.name.split(' ').slice(1).join(' ') || input.name,
      return_url: `${origin}/payments?checkout=${encodeURIComponent(input.id)}`,
      callback_url: `${callbackOrigin}/api/v1/checkout/callback/${encodeURIComponent(input.id)}`,
      customization: { title: 'DigiRent', description: 'Rent payment' },
    });
    let link: URL;
    try { link = new URL(data.checkout_url); } catch { throw new HttpError(502, 'Chapa returned an invalid checkout link'); }
    const localTest = paymentConfig().localTest && ['127.0.0.1', 'localhost'].includes(link.hostname);
    const trusted = link.protocol === 'https:' && (link.hostname === 'chapa.co' || link.hostname.endsWith('.chapa.co') || link.hostname === 'chapa.global' || link.hostname.endsWith('.chapa.global'));
    if (!localTest && !trusted) throw new HttpError(502, 'Chapa returned an invalid checkout link');
    return link.href;
  }
  async verify(id: string, amount: string) {
    const data = await this.call('/transaction/verify/' + encodeURIComponent(id));
    if (data.tx_ref !== id || data.currency !== 'ETB' || data.mode !== chapaMode()) throw new HttpError(409, 'Payment verification details do not match this checkout');
    try {
      if (cents(data.amount) !== cents(amount)) throw new Error('Amount mismatch');
    } catch { throw new HttpError(409, 'Payment verification amount does not match this checkout'); }
    if (data.status !== 'success') return { paid: false, reference: null };
    if (typeof data.reference !== 'string' || !data.reference) throw new HttpError(502, 'Chapa did not return a payment reference');
    return { paid: true, reference: data.reference };
  }
}

export function validWebhook(rawBody: Buffer, headers: { chapa?: string; payload?: string }) {
  const secret = process.env.CHAPA_WEBHOOK_SECRET;
  if (!secret) throw new HttpError(503, 'Payment webhook is not configured');
  const matches = (value: string | undefined, expected: string) => !!value && /^[a-fA-F0-9]{64}$/.test(value) && timingSafeEqual(Buffer.from(value, 'hex'), Buffer.from(expected, 'hex'));
  return matches(headers.chapa, createHmac('sha256', secret).update(secret).digest('hex')) || matches(headers.payload, createHmac('sha256', secret).update(rawBody).digest('hex'));
}
