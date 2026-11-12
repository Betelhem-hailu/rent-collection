import landlordRoutes from '../modules/landlord/landlord.routes.js';
import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes.js';
import paymentRoutes from '../modules/payment/payment.routes.js';
import leaseRoutes from '../modules/lease/lease.routes.js';
import propertyRoutes from '../modules/property/property.routes.js';
import accountRoutes from '../modules/account/account.routes.js';
import tenantRoutes from '../modules/tenant/tenant.routes.js';
import checkoutRoutes from '../modules/checkout/checkout.routes.js';
import notificationRoutes from '../modules/notification/notification.routes.js';

const router = Router();
router.use('/api/v1', landlordRoutes);
router.use('/api/v1', authRoutes);
router.use('/api/v1', paymentRoutes);
router.use('/api/v1', leaseRoutes);
router.use('/api/v1', propertyRoutes);
router.use('/api/v1', accountRoutes);
router.use('/api/v1', tenantRoutes);
router.use('/api/v1', checkoutRoutes);
router.use('/api/v1', notificationRoutes);

export default router;
