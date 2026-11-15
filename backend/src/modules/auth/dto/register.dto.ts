import { z } from 'zod';
import { PhoneSchema } from '../../../shared/phone.js';

export const RegisterSchema = z.object({
  name: z.string()
    .min(2, { message: "Name is too short" })
    .max(32, { message: "Name is too long" }),
  phone: PhoneSchema,
  email: z.email().max(254).optional(),
  password: z.string().regex(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{8,}$/, {
      message:
        "Password must be at least 8 characters long, contain at least one letter, one number, and one special character",
    }),
  businessRole: z.enum(['LANDLORD', 'TENANT'], { message: 'Business role must be either LANDLORD or TENANT' }),
});

export type RegisterDto = z.infer<typeof RegisterSchema>;
