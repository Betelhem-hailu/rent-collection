import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../../utils/type.js';
import { PaymentRepository } from './payment.repository.js';
import { PaymentError, PaymentService } from './payment.service.js';

function handleError(res: Response, error: unknown) {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: error.issues.map(issue => issue.message).join('. ') });
  }
  if (error instanceof PaymentError) return res.status(error.status).json({ error: error.message });
  console.error('Payment request failed:', error);
  return res.status(500).json({ error: 'Unable to process payment request' });
}

export function createPaymentController(service: PaymentService) {
  return {
    async list(req: AuthRequest, res: Response) {
      try {
        const payments = await service.list(req.userId, req.query);
        return res.status(200).json({ payments });
      } catch (error) { return handleError(res, error); }
    },
    async getById(req: AuthRequest, res: Response) {
      try {
        const payment = await service.getById(req.userId, req.params.id);
        return res.status(200).json({ payment });
      } catch (error) { return handleError(res, error); }
    },
    async create(req: AuthRequest, res: Response) {
      try {
        const payment = await service.create(req.userId, req.body);
        return res.status(201).json({ payment });
      } catch (error) { return handleError(res, error); }
    },
    async handleWebhook(_req: AuthRequest, res: Response) {
      return res.status(501).json({ error: 'Payment provider webhook integration is not configured' });
    },
  };
}

export const PaymentController = createPaymentController(new PaymentService(new PaymentRepository()));
