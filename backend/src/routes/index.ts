import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes.js';
import paymentRoutes from '../modules/payment/payment.routes.js';
// import leaseRoutes from '../modules/lease/lease.routes.js';
// import propertyRoutes from '../modules/property/property.routes.js';

const router = Router();

router.use('/api/v1', authRoutes);
router.use('/api/v1', paymentRoutes);
// router.use('/api/v1', leaseRoutes);
// router.use('/api/v1', propertyRoutes);

export default router;