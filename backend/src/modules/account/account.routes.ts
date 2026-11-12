import { Router } from 'express';
import { z } from 'zod';
import { AuthMiddleware } from '../auth/auth.middleware.js';
import { AuthRepository } from '../auth/auth.repository.js';
import { activeUser, HttpError, route } from '../../shared/http.js';
import { prisma } from '../../shared/database/prisma.service.js';

const router = Router();
const auth = new AuthMiddleware(new AuthRepository());
router.use(['/auth/me', '/admin'], auth.authenticated.bind(auth));

router.get('/auth/me', route(async (req, res) => {
  const user = await activeUser(req.userId);
  const role = user.role === 'ADMIN' ? 'ADMIN' : await new AuthRepository().findRoleByUserId(user.id);
  return res.json({ user: { id: user.id, name: user.name, phone: user.phone, email: user.email, businessRole: role }, checkoutAvailable: !!process.env.CHAPA_SECRET_KEY, emailNotificationsAvailable: !!process.env.SMTP_HOST && !!process.env.SMTP_FROM });
}));

router.patch('/auth/me', route(async (req, res) => {
  const user = await activeUser(req.userId);
  const { email } = z.object({ email: z.email().max(254) }).parse(req.body);
  await prisma.orm.public.User.where({ id: user.id }).update({ email });
  return res.json({ success: true });
}));

router.get('/admin/users', route(async (req, res) => {
  const admin = await activeUser(req.userId);
  if (admin.role !== 'ADMIN') throw new HttpError(403, 'Administrator access required');
  const users = await prisma.orm.public.User.select('id', 'name', 'phone', 'email', 'isActive', 'role').all();
  return res.json({ users });
}));

router.patch('/admin/users/:id', route(async (req, res) => {
  const admin = await activeUser(req.userId);
  if (admin.role !== 'ADMIN') throw new HttpError(403, 'Administrator access required');
  const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
  const id = z.string().min(1).parse(req.params.id);
  if (id === admin.id && !isActive) throw new HttpError(409, 'You cannot deactivate your own account');
  const target = await prisma.orm.public.User.where({ id }).first();
  if (!target) throw new HttpError(404, 'Account not found');
  await prisma.orm.public.User.where({ id }).update({ isActive });
  return res.json({ success: true });
}));

export default router;
