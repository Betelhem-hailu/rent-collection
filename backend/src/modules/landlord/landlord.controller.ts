import type { NextFunction, Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../../utils/type.js';
import { LandlordRepository } from './landlord.repository.js';
import { LandlordError, LandlordService } from './landlord.service.js';

function handleError(res: Response, error: unknown) {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: error.issues.map(issue => issue.message).join('. ') });
  }
  if (error instanceof LandlordError) return res.status(error.status).json({ error: error.message });
  console.error('Landlord request failed:', error);
  return res.status(500).json({ error: 'Unable to complete landlord request' });
}

export function createLandlordController(service: LandlordService) {
  return {
    async authorize(req: AuthRequest, res: Response, next: NextFunction) {
      try {
        await service.authorize(req.userId);
        next();
      } catch (error) { return handleError(res, error); }
    },
    async overview(req: AuthRequest, res: Response) {
      try {
        return res.json(await service.overview(req.userId!));
      } catch (error) { return handleError(res, error); }
    },
    async createProperty(req: AuthRequest, res: Response) {
      try {
        const property = await service.createProperty(req.userId!, req.body);
        return res.status(201).json({ property });
      } catch (error) { return handleError(res, error); }
    },
    async findTenant(req: AuthRequest, res: Response) {
      try {
        const tenant = await service.findTenant(req.body);
        return res.json({ tenant });
      } catch (error) { return handleError(res, error); }
    },
    async createLease(req: AuthRequest, res: Response) {
      try {
        const lease = await service.createLease(req.userId!, req.body);
        return res.status(201).json({ lease });
      } catch (error) { return handleError(res, error); }
    },
    async updateLease(req: AuthRequest, res: Response) {
      try {
        return res.json(await service.updateLease(req.userId!, String(req.params.id), req.body));
      } catch (error) { return handleError(res, error); }
    },
  };
}

export const LandlordController = createLandlordController(new LandlordService(new LandlordRepository()));
