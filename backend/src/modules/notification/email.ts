import nodemailer from 'nodemailer';
import { HttpError } from '../../shared/http.js';

export function emailTransport() {
  const host = process.env.SMTP_HOST;
  const from = process.env.SMTP_FROM;
  if (!host || !from) throw new HttpError(503, 'Email reminders are not configured. Please contact support.');
  const port = Number(process.env.SMTP_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new HttpError(503, 'Invalid email configuration');
  if (!!process.env.SMTP_USER !== !!process.env.SMTP_PASSWORD) throw new HttpError(503, 'Incomplete email credentials');
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const transport = nodemailer.createTransport({
    host, port, secure,
    requireTLS: !secure && process.env.NODE_ENV !== 'test' && process.env.SMTP_REQUIRE_TLS !== 'false',
    ...(process.env.SMTP_USER ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } } : {}),
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
  });
  return { transport, from };
}
