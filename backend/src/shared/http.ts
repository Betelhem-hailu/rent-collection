import type { Request, Response, RequestHandler } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../utils/type.js';
import { prisma } from './database/prisma.service.js';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const route = (fn: (req: AuthRequest, res: Response) => Promise<unknown>): RequestHandler => async (req, res, next) => {
  try { await fn(req, res); } catch (error) { next(error); }
};
export async function activeUser(id?: string) {
  if (!id) throw new HttpError(401, 'Please sign in');
  const user = await prisma.orm.public.User.where({ id }).first();
  if (!user?.isActive) throw new HttpError(403, 'Active account required');
  return user;
}
export function errorResponse(error: unknown, _req: Request, res: Response, _next: unknown) {
  if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues.map(i => i.message).join('. ') });
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  if (error instanceof SyntaxError && 'status' in error && error.status === 400) return res.status(400).json({ error: 'Invalid JSON request' });
  console.error('Request failed:', error);
  return res.status(500).json({ error: 'Unable to complete request' });
}
