import { Request, Response } from 'express';
import { AuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';
import { RegisterSchema } from './dto/register.dto.js';
import { z } from 'zod';

export function createAuthController(authService: AuthService) {
  const register = async (req: Request, res: Response) => {
    try {
      const dto = RegisterSchema.parse(req.body);
      const user = await authService.register(dto);
      return res.status(201).json({ user });
    } catch (err) {
      if (err instanceof Error && err.message === 'PHONE_ALREADY_EXISTS') {
        return res.status(409).json({ error: 'Phone already registered' });
      }
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: err.issues.map(issue => issue.message).join('. ') });
      }
      console.error('Registration failed:', err);
      return res.status(500).json({ error: 'Something went wrong' });
    }
  };

  const login = async (req: Request, res: Response) => {
    try {
      const { phone, email, password } = req.body ?? {};
      const user = await authService.login(phone ?? email, password);
      return res.status(200).json({ user });
    } catch (err) {
      if (err instanceof Error && err.message === 'INVALID_CREDENTIALS') {
        return res.status(401).json({ error: 'Invalid phone number or password' });
      }
      if (err instanceof Error && err.message === 'USER_NOT_ACTIVE') {
        return res.status(403).json({ error: 'User account is not active' });
      }
      console.error('Login failed:', err);
      return res.status(500).json({ error: 'Failed to login' });
    }
  };

  return { register, login };
}

export const { register, login } = createAuthController(new AuthService(new AuthRepository()));
