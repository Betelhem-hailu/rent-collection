import { Router } from 'express';
import { AuthMiddleware } from '../auth/auth.middleware.js';
import { AuthRepository } from '../auth/auth.repository.js';
import { LandlordController } from '../landlord/landlord.controller.js';
import { prisma } from '../../shared/database/prisma.service.js';
import { activeUser, HttpError, route } from '../../shared/http.js';
import { refreshBilling } from '../billing/billing.repository.js';

const router = Router();
const auth = new AuthMiddleware(new AuthRepository());
router.use('/lease', auth.authenticated.bind(auth));
router.post('/lease', LandlordController.authorize, (req, res) => {
  req.body = { ...req.body, rentAmount: req.body?.rentAmount ?? req.body?.amount };
  return LandlordController.createLease(req, res);
});
router.get('/lease/:id', auth.authenticated.bind(auth), route(async (req, res) => {
  const user = await activeUser(req.userId);
  const lease = await prisma.orm.public.Lease.where({ id: String(req.params.id) }).first();
  if (!lease) throw new HttpError(404, 'Lease not found');
  const property = await prisma.orm.public.Property.where({ id: lease.propertyId }).first();
  if (lease.tenantId !== user.id && property?.landlordId !== user.id && user.role !== 'ADMIN') throw new HttpError(404, 'Lease not found');
  await refreshBilling([lease.id]);
  const billingPeriods = await prisma.orm.public.BillingPeriod.where({ leaseId: lease.id }).all();
  return res.json({ lease, billingPeriods });
}));
export default router;
