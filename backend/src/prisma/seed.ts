// prisma/seed.ts
import { prisma } from "../shared/database/prisma.service.js";
import bcrypt from "bcrypt";

async function main() {
  const phone = process.env.ADMIN_PHONE;
  const password = process.env.ADMIN_PASSWORD;
  if (!phone || !password) throw new Error("ADMIN_PHONE and ADMIN_PASSWORD are required");

  await prisma.orm.public.User.upsert({
    conflictOn: { phone },
    update: {},                       
    create: {
      name: "system admin",
      phone,
      password: await bcrypt.hash(password, 12),
      role: "ADMIN",
    },
  });
}