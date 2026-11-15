import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { AuthRepository } from './auth.repository.js';
import { RegisterDto } from './dto/register.dto.js';
import generateToken from './helper/generateToken.js';
import { PhoneSchema } from '../../shared/phone.js';

const SALT_ROUNDS = 12;

export class AuthService {
  constructor(private authRepository: AuthRepository) {}

  async register(dto: RegisterDto) {
    const phone = PhoneSchema.parse(dto.phone);
    const existingUser = await this.authRepository.findByPhone(phone);
    if (existingUser) {
      throw new Error('PHONE_ALREADY_EXISTS');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const user = await this.authRepository.create({
      name: dto.name,
      phone,
      passwordHash,
      role: dto.businessRole,
      email: dto.email,
    }).catch(error => {
      let cause: unknown = error;
      for (let depth = 0; depth < 6 && cause && typeof cause === 'object'; depth++) {
        if ('code' in cause && (cause.code === '23505' || cause.code === 'P2002')) throw new Error('PHONE_ALREADY_EXISTS');
        cause = 'cause' in cause ? cause.cause : undefined;
      }
      throw error;
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
    const parsedPhone = PhoneSchema.safeParse(phone);
    if (!parsedPhone.success) throw new Error('INVALID_CREDENTIALS');
    const user = await this.authRepository.findByPhone(parsedPhone.data);
    if (!user?.password || user.authState === 'UNINITIALIZED') {
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

  async tenantLogin(phone: string, verificationToken: string) {
    const secret = process.env.TENANT_PHONE_VERIFICATION_SECRET;
    if (!secret || secret === process.env.JWT_SECRET_KEY) throw new Error('PHONE_LOGIN_UNAVAILABLE');
    const normalizedPhone = PhoneSchema.parse(phone);
    try {
      const proof = jwt.verify(verificationToken, secret, {
        algorithms: ['HS256'], issuer: 'digirent-phone-verifier', audience: 'digirent-tenant-login', maxAge: '5m',
      });
      if (typeof proof === 'string' || proof.sub !== normalizedPhone || proof.purpose !== 'tenant-phone-login'
        || typeof proof.exp !== 'number' || typeof proof.iat !== 'number'
        || proof.exp > proof.iat + 300 || proof.iat > Math.floor(Date.now() / 1000) + 30) throw new Error();
    } catch { throw new Error('INVALID_PHONE_VERIFICATION'); }
    const user = await this.authRepository.findByPhone(normalizedPhone);
    if (!user || user.role !== 'TENANT') throw new Error('INVALID_PHONE_VERIFICATION');
    if (!user.isActive || !await this.authRepository.verifyPhoneIdentity(user.id)) throw new Error('USER_NOT_ACTIVE');
    const token = generateToken(user.id);
    const claims = jwt.decode(token) as jwt.JwtPayload;
    return { token, expiresIn: claims.exp! - claims.iat!, message: 'Login successful' };
  }
}
