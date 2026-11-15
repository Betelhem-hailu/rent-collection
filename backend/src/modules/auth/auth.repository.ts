import { randomUUID } from 'node:crypto';
import { prisma } from "../../shared/database/prisma.service.js";


export class AuthRepository {
  async findByPhone(phone: string) {
    return await prisma.orm.public.User.where({ phone }).first();
  }

  async create(data: { name: string; phone: string; passwordHash: string; role: 'LANDLORD' | 'TENANT'; email?: string }) {
    return prisma.transaction(async tx => {
      const user = await tx.orm.public.User.create({
        id: randomUUID(),
        name: data.name,
        phone: data.phone,
        email: data.email,
        password: data.passwordHash,
        role: data.role,
        authState: 'PASSWORD',
        isActive: false,
      },
      );
      if (data.role === 'LANDLORD') await tx.orm.public.Landlord.create({ userId: user.id });
      return user;
    });
  }

  async verifyPhoneIdentity(id: string) {
    return prisma.transaction(async tx => {
      await tx.orm.public.User.where({ id }).update({ id });
      const user = await tx.orm.public.User.where({ id, role: 'TENANT', isActive: true }).first();
      if (!user) return null;
      if (user.authState === 'UNINITIALIZED') await tx.orm.public.User.where({ id }).update({ authState: 'PHONE_VERIFIED' });
      return user;
    });
  }

  async findRoleByUserId(userId: string) {
    const user = await prisma.orm.public.User.where({ id: userId }).select('role').first();
    return user?.role || null;
  }
}
