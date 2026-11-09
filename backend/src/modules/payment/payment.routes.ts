import { Router } from 'express';
import { PaymentController } from './payment.controller.js';
import { AuthMiddleware } from '../auth/auth.middleware.js';
import { AuthRepository } from '../auth/auth.repository.js';

const router = Router();
const middleware = new AuthMiddleware(new AuthRepository());
const authMiddleware = middleware.authenticated.bind(middleware);

router.get('/payments', authMiddleware, PaymentController.list);
router.get('/payments/:id', authMiddleware, PaymentController.getById);
router.post('/payments', authMiddleware, PaymentController.create);
// Provider-specific verification and processing will be added later.
router.post('/payments/:id/webhook', PaymentController.handleWebhook);

export default router;
