import { z } from 'zod';

// Store one E.164 identity for Ethiopian local, 00-prefixed and international input.
// Other international numbers remain supported for existing platform accounts.
export function normalizePhone(input: string): string {
  let phone = input.trim().replace(/[\s().-]/g, '');
  if (phone.startsWith('00')) phone = '+' + phone.slice(2);
  if (/^0[79]\d{8}$/.test(phone)) phone = '+251' + phone.slice(1);
  else if (/^[79]\d{8}$/.test(phone)) phone = '+251' + phone;
  else if (/^[1-9]\d{10,14}$/.test(phone)) phone = '+' + phone;
  return phone;
}

export const PhoneSchema = z.string().max(40).transform(normalizePhone)
  .pipe(z.string().regex(/^\+[1-9]\d{10,14}$/, 'Enter a valid phone number, for example +251911234567'));
