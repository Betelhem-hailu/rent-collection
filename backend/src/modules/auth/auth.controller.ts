import { Request, Response } from 'express';
import { AuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';
import { RegisterSchema } from './dto/register.dto.js';

const authService = new AuthService(new AuthRepository());

export const register = async (req: Request, res: Response) => {
  try {
    const dto = RegisterSchema.parse(req.body); // validation happens here
    const user = await authService.register(dto);
    res.status(201).json({ user });
  } catch (err: any) {
    if (err.message === 'EMAIL_ALREADY_EXISTS') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: err.errors });
    }
    res.status(500).json({ error: 'Something went wrong' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const user = await authService.login(email, password);
    res.status(200).json({ user });
  } catch (err: any) {
    if (err.message === 'INVALID_CREDENTIALS') {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    if (err.message === 'USER_NOT_ACTIVE') {
      return res.status(403).json({ error: 'User account is not active' });
    }
    if (err.message === 'LOGIN_FAILED') {
      return res.status(500).json({ error: 'Failed to login' });
    }
  }
}