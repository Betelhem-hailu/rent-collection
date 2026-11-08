import { Router } from 'express';
import { PaymentController } from './payment.controller.js';
import { authMiddleware } from '../auth/auth.middleware.js';

const router = Router();

router.get('/payments', authMiddleware, PaymentController.list);
router.get('/payments/:id', authMiddleware, PaymentController.getById);
router.post('/payments', authMiddleware, PaymentController.create);
router.post('/payments/:id/webhook', PaymentController.handleWebhook); // no auth — gateway calls this

export default router;