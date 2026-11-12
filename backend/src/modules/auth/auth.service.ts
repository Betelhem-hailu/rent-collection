import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { AuthRepository } from './auth.repository.js';
import { RegisterDto } from './dto/register.dto.js';
import generateToken from './helper/generateToken.js';

const SALT_ROUNDS = 12;

export class AuthService {
  constructor(private authRepository: AuthRepository) {}

  async register(dto: RegisterDto) {
    const existingUser = await this.authRepository.findByPhone(dto.phone);
    if (existingUser) {
      throw new Error('PHONE_ALREADY_EXISTS');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const user = await this.authRepository.create({
      name: dto.name,
      phone: dto.phone,
      passwordHash,
      role: 'USER',
      email: dto.email,
      businessRole: dto.businessRole,
    });

    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      role: dto.businessRole,
    };
  }

  async login(phone: string, password: string) {
    if (typeof phone !== 'string' || !phone.trim() || typeof password !== 'string' || !password) {
      throw new Error('INVALID_CREDENTIALS');
    }
    const user = await this.authRepository.findByPhone(phone);
    if (!user) {
      throw new Error('INVALID_CREDENTIALS');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new Error('INVALID_CREDENTIALS');
    }

    if (!user.isActive) {
      throw new Error('USER_NOT_ACTIVE');
    }

    const generatedToken = generateToken(user.id);
    const claims = jwt.decode(generatedToken) as jwt.JwtPayload;
    return {
      token: generatedToken,
      expiresIn: claims.exp! - claims.iat!,
      message: 'Login successful',
    };
  }
}
