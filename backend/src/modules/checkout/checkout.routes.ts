import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { Temporal } from 'temporal-polyfill';
import { z } from 'zod';
import { prisma } from '../../shared/database/prisma.service.js';
import { activeUser, HttpError, route } from '../../shared/http.js';
import { AuthMiddleware } from '../auth/auth.middleware.js';
import { AuthRepository } from '../auth/auth.repository.js';
import { CreatePaymentSchema } from '../payment/payment.dto.js';
import { cents, money } from '../billing/billing.js';
import { lockLease, syncBilling } from '../billing/billing.repository.js';
import { Chapa, paymentConfig, validWebhook } from './chapa.js';

const db = prisma.orm.public;
const chapa = new Chapa();
const router = Router();
const auth = new AuthMiddleware(new AuthRepository());
const identifier = z.string().min(1).max(128);

async function completeCheckout(id: string) {
  const checkout = await db.Checkout.where({ id }).first();
  if (!checkout) throw new HttpError(404, 'Checkout not found');
  if (checkout.status === 'PAID') return { status: 'PAID' };
  const verified = await chapa.verify(checkout.id, String(checkout.amount));
  if (!verified.paid) return { status: checkout.status };
  return prisma.transaction(async tx => {
    await lockLease(tx, checkout.leaseId);
    const current = await tx.orm.public.Checkout.where({ id }).first();
    if (current?.status === 'PAID') return { status: 'PAID' };
    // The checkout reference is unique in the receipt ledger as well as the checkout table.
    const existing = await tx.orm.public.Payment.where({ transactionRef: id }).first();
    if (existing && (existing.leaseId !== checkout.leaseId || cents(String(existing.amount)) !== cents(String(checkout.amount)))) throw new HttpError(409, 'Payment reference conflicts with an existing receipt');
    if (!existing) await tx.orm.public.Payment.create({ id: randomUUID(), leaseId: checkout.leaseId, amount: String(checkout.amount), transactionRef: id, paymentMethod: 'MOBILE_MONEY', paymentDate: Temporal.Now.instant() });
    await tx.orm.public.Checkout.where({ id }).update({ status: 'PAID', providerReference: verified.reference });
    await syncBilling(tx, checkout.leaseId);
    return { status: 'PAID' };
  });
}

router.post('/checkout', auth.authenticated.bind(auth), route(async (req, res) => {
  const user = await activeUser(req.userId);
  paymentConfig();
  if (!user.email) throw new HttpError(400, 'Add your email address before paying online');
  const parsed = CreatePaymentSchema.pick({ leaseId: true, amount: true }).parse(req.body);
  if (cents(parsed.amount) > 100000000000000n) throw new HttpError(400, 'Online payment amount is too large');
  const checkout = await prisma.transaction(async tx => {
    const lease = await tx.orm.public.Lease.where({ id: parsed.leaseId }).first();
    if (!lease || lease.tenantId !== user.id) throw new HttpError(403, 'Only the tenant on this lease can check out');
    const { bills } = await syncBilling(tx, lease.id);
    const outstanding = bills.reduce((sum, b) => sum + cents(String(b.amount)) - cents(String(b.paidAmount)), 0n);
    if (cents(parsed.amount) > outstanding) throw new HttpError(400, `Amount exceeds the outstanding rent of ETB ${money(outstanding)}`);
    const pending = await tx.orm.public.Checkout.where({ leaseId: lease.id, status: 'PENDING' }).orderBy(c => c.createdAt.desc()).first();
    if (pending && Temporal.Now.instant().epochMilliseconds - pending.createdAt.epochMilliseconds < 15 * 60 * 1000) {
      if (String(pending.amount) !== parsed.amount && cents(String(pending.amount)) !== cents(parsed.amount)) throw new HttpError(409, 'Another checkout is pending for this lease. Complete it or try again after 15 minutes.');
      if (!pending.checkoutUrl) throw new HttpError(409, 'Checkout is being prepared. Please retry shortly.');
      return pending;
    }
    return tx.orm.public.Checkout.create({ id: 'rent_' + randomUUID(), leaseId: lease.id, tenantId: user.id, amount: parsed.amount, currency: 'ETB', status: 'PENDING' });
  });
  if (checkout.checkoutUrl) return res.json({ checkout });
  try {
    const checkoutUrl = await chapa.initialize({ id: checkout.id, amount: String(checkout.amount), email: user.email, name: user.name });
    await db.Checkout.where({ id: checkout.id }).update({ checkoutUrl });
    return res.status(201).json({ checkout: { ...checkout, checkoutUrl } });
  } catch (error) {
    // An initialize timeout may still have created a provider session. Its verified callback
    // remains accepted, and a later successful charge is always recorded as rent/credit.
    await db.Checkout.where({ id: checkout.id, status: 'PENDING' }).update({ status: 'FAILED' });
    throw error;
  }
}));

router.post('/checkout/:id/verify', auth.authenticated.bind(auth), route(async (req, res) => {
  const user = await activeUser(req.userId);
  const id = identifier.parse(req.params.id);
  const checkout = await db.Checkout.where({ id }).first();
  if (!checkout || checkout.tenantId !== user.id) throw new HttpError(404, 'Checkout not found');
  return res.json(await completeCheckout(id));
}));

// The callback is only a prompt to verify using the server's Chapa key. Its query/body
// never decides whether a payment was made.
router.get('/checkout/callback/:id', route(async (req, res) => res.json(await completeCheckout(identifier.parse(req.params.id)))));

export const checkoutWebhook = route(async (req, res) => {
  paymentConfig();
  const rawBody = (req as typeof req & { rawBody?: Buffer }).rawBody;
  if (!rawBody || !validWebhook(rawBody, { chapa: req.get('chapa-signature'), payload: req.get('x-chapa-signature') })) throw new HttpError(401, 'Invalid payment webhook signature');
  const id = identifier.parse(req.params.id || req.body?.tx_ref || req.body?.trx_ref || req.body?.data?.tx_ref);
  return res.json(await completeCheckout(id));
});
router.post('/checkout/webhook', checkoutWebhook);
router.post('/payments/:id/webhook', checkoutWebhook);

export default router;
