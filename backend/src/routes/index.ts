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
const api = Router();
api.use(landlordRoutes, authRoutes, paymentRoutes, leaseRoutes, propertyRoutes, accountRoutes, tenantRoutes, checkoutRoutes, notificationRoutes);
router.use(['/api/v1', '/api'], api);

export default router;
