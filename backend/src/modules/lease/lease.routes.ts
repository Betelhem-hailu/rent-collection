import { Router } from 'express';
import { AuthMiddleware } from '../auth/auth.middleware.js';
import { AuthRepository } from '../auth/auth.repository.js';
import { LandlordController } from '../landlord/landlord.controller.js';
import { prisma } from '../../shared/database/prisma.service.js';
import { activeUser, HttpError, route } from '../../shared/http.js';
import { refreshBilling } from '../billing/billing.repository.js';

const router = Router();
const auth = new AuthMiddleware(new AuthRepository());
router.use(['/lease', '/leases'], auth.authenticated.bind(auth));
router.post(['/lease', '/leases'], LandlordController.authorize, (req, res) => {
  req.body = { ...req.body, rentAmount: req.body?.rentAmount ?? req.body?.amount };
  return LandlordController.createLease(req, res);
});
router.patch(['/lease/:id', '/leases/:id'], LandlordController.authorize, LandlordController.updateLease);
router.get('/lease/:id', auth.authenticated.bind(auth), route(async (req, res) => {
  const user = await activeUser(req.userId);
  const lease = await prisma.orm.public.Lease.where({ id: String(req.params.id) }).first();
  if (!lease) throw new HttpError(404, 'Lease not found');
  if (lease.tenantUserId !== user.id && lease.landlordId !== user.id && user.role !== 'ADMIN') throw new HttpError(404, 'Lease not found');
  await refreshBilling([lease.id]);
  const billingPeriods = await prisma.orm.public.BillingPeriod.where({ leaseId: lease.id }).all();
  return res.json({ lease, billingPeriods });
}));
export default router;
