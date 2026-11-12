import { Router } from 'express';
import { AuthMiddleware } from '../auth/auth.middleware.js';
import { AuthRepository } from '../auth/auth.repository.js';
import { LandlordController } from '../landlord/landlord.controller.js';
import { prisma } from '../../shared/database/prisma.service.js';
import { activeUser, HttpError, route } from '../../shared/http.js';

const router = Router();
const auth = new AuthMiddleware(new AuthRepository());
router.use('/property', auth.authenticated.bind(auth));
router.post('/property', LandlordController.authorize, LandlordController.createProperty);
router.get('/property/:id', auth.authenticated.bind(auth), route(async (req, res) => {
  const user = await activeUser(req.userId);
  const property = await prisma.orm.public.Property.where({ id: String(req.params.id) }).first();
  if (!property) throw new HttpError(404, 'Property not found');
  if (property.landlordId !== user.id && user.role !== 'ADMIN' && !await prisma.orm.public.Lease.where({ propertyId: property.id, tenantId: user.id }).first()) throw new HttpError(404, 'Property not found');
  return res.json({ property });
}));
export default router;
