import { Router, type RequestHandler } from 'express';
import { AuthMiddleware } from '../auth/auth.middleware.js';
import { AuthRepository } from '../auth/auth.repository.js';
import { route } from '../../shared/http.js';
import { TenantRepository } from './tenant.repository.js';
import { TenantService } from './tenant.service.js';

const auth = new AuthMiddleware(new AuthRepository());

export function createTenantRouter(service: TenantService, authenticate: RequestHandler = auth.authenticated.bind(auth)) {
  const router = Router();
  router.use('/tenant', authenticate);
  router.get('/tenant/portal', route(async (req, res) => res.json(await service.overview(req.userId))));
  router.get('/tenant/overview', route(async (req, res) => res.json(await service.overview(req.userId, false))));
  return router;
}

export default createTenantRouter(new TenantService(new TenantRepository()));
