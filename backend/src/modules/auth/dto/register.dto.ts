import { z } from 'zod';

export const RegisterSchema = z.object({
  name: z.string()
    .min(2, { message: "Name is too short" })
    .max(32, { message: "Name is too long" }),
  phone: z.string().regex(/^\+?[1-9]\d{10,14}$/, { message: "Invalid phone number" }),
  password: z.string().regex(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{8,}$/, {
      message:
        "Password must be at least 8 characters long, contain at least one letter, one number, and one special character",
    }),
  role: z.enum(['user', 'admin',], { message: 'Role must be either user or admin' }),
  businessRole: z.enum(['LANDLORD', 'TENANT'], { message: 'Business role must be either LANDLORD or TENANT' }).optional(),
});

export type RegisterDto = z.infer<typeof RegisterSchema>;