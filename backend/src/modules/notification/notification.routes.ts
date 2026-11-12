import { Router } from 'express';
import { z } from 'zod';
import { Temporal } from 'temporal-polyfill';
import { prisma } from '../../shared/database/prisma.service.js';
import { activeUser, HttpError, route } from '../../shared/http.js';
import { AuthMiddleware } from '../auth/auth.middleware.js';
import { AuthRepository } from '../auth/auth.repository.js';
import { syncBilling } from '../billing/billing.repository.js';
import { cents, money, stableId, today } from '../billing/billing.js';
import { emailTransport } from './email.js';

const db = prisma.orm.public;
const router = Router();
const auth = new AuthMiddleware(new AuthRepository());
router.post('/landlord/leases/:id/remind', auth.authenticated.bind(auth), route(async (req, res) => {
  const user = await activeUser(req.userId);
  const leaseId = z.string().min(1).parse(req.params.id);
  const lease = await db.Lease.where({ id: leaseId }).first();
  const property = lease ? await db.Property.where({ id: lease.propertyId, landlordId: user.id }).first() : null;
  if (!lease || !property || !await db.Landlord.where({ userId: user.id }).first()) throw new HttpError(404, 'Lease not found');
  const tenant = await db.User.where({ id: lease.tenantId }).first();
  if (!tenant?.email) throw new HttpError(400, 'The tenant needs to add an email address before receiving reminders');
  const { transport, from } = emailTransport();
  const notification = await prisma.transaction(async tx => {
    const { bills } = await syncBilling(tx, leaseId);
    const amount = bills.filter(b => b.urgencyStatus === 'OVERDUE').reduce((sum, b) => sum + cents(String(b.amount)) - cents(String(b.paidAmount)), 0n);
    if (amount <= 0n) throw new HttpError(409, 'This lease has no overdue rent');
    const id = stableId('overdue-email', leaseId, today());
    const previous = await tx.orm.public.Notification.where({ id }).first();
    if (previous?.status === 'SENT') return previous;
    if (previous?.status === 'DELIVERING' && previous.lastAttemptAt && Temporal.Now.instant().epochMilliseconds - previous.lastAttemptAt.epochMilliseconds < 5 * 60 * 1000) throw new HttpError(409, 'This reminder is being sent. Please retry shortly.');
    const subject = `Overdue rent reminder: ${property.description}`;
    const body = `Hello ${tenant.name},\n\nYour overdue rent for ${property.description}, ${property.location}, is ETB ${money(amount)} as of ${today()}.\n\nPlease sign in to DigiRent to review your bills and make a payment. If you have already paid, please contact ${user.name} at ${user.phone}.\n\n${user.name}\nDigiRent`;
    const values = { recipientEmail: tenant.email!, subject, body, status: 'DELIVERING', lastAttemptAt: Temporal.Now.instant(), error: null };
    if (previous) {
      await tx.orm.public.Notification.where({ id }).update(values);
      return { ...previous, ...values };
    }
    return tx.orm.public.Notification.create({ id, leaseId, senderId: user.id, recipientId: tenant.id, ...values });
  });
  if (notification.status === 'SENT') { transport.close(); return res.json({ notification: { id: notification.id, status: 'SENT' }, alreadySent: true }); }
  try {
    const delivery = await transport.sendMail({ from, to: notification.recipientEmail, subject: notification.subject, text: notification.body, messageId: `<${notification.id}@digirent.local>` });
    if (!delivery.accepted?.length || delivery.rejected?.length) throw new Error('Recipient was rejected');
    await db.Notification.where({ id: notification.id }).update({ status: 'SENT', sentAt: Temporal.Now.instant(), error: null });
    return res.json({ notification: { id: notification.id, status: 'SENT' } });
  } catch {
    await db.Notification.where({ id: notification.id }).update({ status: 'FAILED', error: 'Email delivery failed. Please retry.' });
    throw new HttpError(502, 'The reminder could not be sent. Please try again.');
  } finally { transport.close(); }
}));

router.get('/landlord/notifications', auth.authenticated.bind(auth), route(async (req, res) => {
  const user = await activeUser(req.userId);
  if (!await db.Landlord.where({ userId: user.id }).first()) throw new HttpError(403, 'Landlord access required');
  return res.json({ notifications: await db.Notification.where({ senderId: user.id }).orderBy(n => n.createdAt.desc()).limit(100).all() });
}));
export default router;
