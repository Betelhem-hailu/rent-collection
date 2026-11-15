import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { prisma } from "../shared/database/prisma.service.js";
import bcrypt from "bcrypt";
import { PhoneSchema } from '../shared/phone.js';

async function main() {
  for (const name of ['Apartment', 'House', 'Studio', 'Commercial']) {
    await prisma.orm.public.PropertyType.upsert({ conflictOn: { name }, create: { name }, update: {} });
  }
  console.log('Property types seeded.');

  const phoneInput = process.env.ADMIN_PHONE;
  const password = process.env.ADMIN_PASSWORD;
  if (!phoneInput && !password) return;
  if (!phoneInput || !password) throw new Error("Set both ADMIN_PHONE and ADMIN_PASSWORD to seed an admin");
  const phone = PhoneSchema.parse(phoneInput);

  await prisma.orm.public.User.upsert({
    conflictOn: { phone },
    update: {},                       
    create: {
      id: randomUUID(),
      name: "system admin",
      phone,
      password: await bcrypt.hash(password, 12),
      role: "ADMIN",
      isActive: true,
    },
  });
}

try {
  await prisma.connect();
  await main();
} catch (error) {
  console.error('Seed failed:', error);
  process.exitCode = 1;
} finally {
  await prisma.close();
}
