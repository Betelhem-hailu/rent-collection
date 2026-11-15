import { Router } from 'express';
import { route } from '../../shared/http.js';
import { ActivationService, ActivationStartSchema, ActivationVerifySchema, ActivationPasswordSchema } from './activation.service.js';
import { SmsUnavailableError } from './sms-verification.js';

export function createActivationRouter(service = new ActivationService()) {
  const router = Router();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.post('/start', route(async (req, res) => {
    await service.throttle(req.ip ?? 'unknown', 'start');
    const input = ActivationStartSchema.parse(req.body);
    return res.status(202).json(await service.start(input.phone));
  }));
  router.post('/verify', route(async (req, res) => {
    await service.throttle(req.ip ?? 'unknown', 'verify');
    const input = ActivationVerifySchema.parse(req.body);
    return res.json(await service.verify(input.challengeId, input.code));
  }));
  router.post('/password', route(async (req, res) => {
    await service.throttle(req.ip ?? 'unknown', 'password');
    const input = ActivationPasswordSchema.parse(req.body);
    return res.json(await service.setPassword(input.challengeId, input.setupToken, input.password));
  }));
  router.use((error: unknown, _req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
    if (error instanceof SmsUnavailableError) return res.status(503).json({ error: error.message });
    next(error);
  });
  return router;
}
