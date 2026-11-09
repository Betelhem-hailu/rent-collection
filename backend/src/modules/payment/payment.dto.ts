import { z } from 'zod';

const identifier = z.string().trim().min(1).max(128);
const amount = z.union([z.string(), z.number().finite()])
  .transform(String)
  .pipe(z.string().regex(/^\d{1,18}(\.\d{1,2})?$/, 'Amount must be a positive decimal with at most two decimal places'))
  .refine(value => /[1-9]/.test(value), 'Amount must be greater than zero');

export const CreatePaymentSchema = z.object({
  leaseId: identifier,
  amount,
  transactionRef: z.string().trim().min(1).max(255),
  paymentMethod: z.enum(['CASH', 'MOBILE_MONEY', 'BANK']),
  paymentDate: z.iso.datetime({ offset: true }).optional(),
});

export const ListPaymentsSchema = z.object({
  leaseId: identifier.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});

export const PaymentIdSchema = identifier;
export type CreatePaymentInput = z.infer<typeof CreatePaymentSchema>;
export type ListPaymentsInput = z.infer<typeof ListPaymentsSchema>;
