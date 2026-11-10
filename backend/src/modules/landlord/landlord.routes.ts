import { Router } from 'express';
import { AuthMiddleware } from '../auth/auth.middleware.js';
import { AuthRepository } from '../auth/auth.repository.js';
import { LandlordController } from './landlord.controller.js';

const router = Router();
const auth = new AuthMiddleware(new AuthRepository());

router.use('/landlord', auth.authenticated.bind(auth), LandlordController.authorize);
router.get('/landlord/overview', LandlordController.overview);
router.post('/landlord/properties', LandlordController.createProperty);
router.post('/landlord/tenants', LandlordController.findTenant);
router.post('/landlord/leases', LandlordController.createLease);
router.patch('/landlord/leases/:id', LandlordController.updateLease);

export default router;
