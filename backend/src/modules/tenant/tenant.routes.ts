import { Router } from 'express';
import { AuthMiddleware } from '../auth/auth.middleware.js';
import { AuthRepository } from '../auth/auth.repository.js';
import { activeUser, HttpError, route } from '../../shared/http.js';
import { prisma } from '../../shared/database/prisma.service.js';
import { refreshBilling } from '../billing/billing.repository.js';

const router = Router();
const auth = new AuthMiddleware(new AuthRepository());
router.use('/tenant', auth.authenticated.bind(auth));
router.get('/tenant/overview', route(async (req, res) => {
  const user = await activeUser(req.userId);
  if (!await prisma.orm.public.Tenant.where({ userId: user.id }).first()) throw new HttpError(403, 'Tenant access required');
  const leases = await prisma.orm.public.Lease.where({ tenantId: user.id }).all();
  const ids = leases.map(l => l.id);
  await refreshBilling(ids);
  const properties = leases.length ? await prisma.orm.public.Property.where(p => p.id.in(leases.map(l => l.propertyId))).all() : [];
  const landlordIds = [...new Set(properties.map(p => p.landlordId))];
  const landlords = landlordIds.length ? await prisma.orm.public.User.where(u => u.id.in(landlordIds)).select('id', 'name', 'phone', 'email').all() : [];
  const billingPeriods = ids.length ? await prisma.orm.public.BillingPeriod.where(b => b.leaseId.in(ids)).all() : [];
  const payments = ids.length ? await prisma.orm.public.Payment.where(p => p.leaseId.in(ids)).all() : [];
  const notifications = await prisma.orm.public.Notification.where({ recipientId: user.id }).orderBy(n => n.createdAt.desc()).limit(100).all();
  const checkouts = await prisma.orm.public.Checkout.where({ tenantId: user.id }).orderBy(c => c.createdAt.desc()).limit(50).all();
  return res.json({ leases, properties, landlords, billingPeriods, payments, notifications, checkouts });
}));
export default router;
