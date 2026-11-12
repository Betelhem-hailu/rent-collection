import { z } from 'zod';

export const PropertySchema = z.object({ description: z.string().trim().min(1), location: z.string().trim().min(1), rooms: z.coerce.number().int().positive(), size: z.coerce.number().positive(), propertyTypeId: z.coerce.number().int().positive() });

export const LeaseSchema = z.object({ propertyId: z.string().min(1), tenantId: z.string().min(1), rentAmount: z.number().positive().max(1e12).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 0.001, 'Rent must have at most two decimal places'), paymentPeriod: z.enum(['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY']), startDate: z.iso.date(), expireDate: z.iso.date(), gracePeriod: z.number().int().nonnegative().max(365), terms: z.string().max(10000).default('') }).refine(d => d.expireDate > d.startDate, 'End date must follow start date').refine(d => Number(d.expireDate.slice(0, 4)) - Number(d.startDate.slice(0, 4)) <= 50, 'Lease must not exceed 50 years');

export const TenantLookupSchema = z.object({ phone: z.string().min(1) });
export const UpdateLeaseSchema = z.object({
  gracePeriod: z.number().int().nonnegative().max(365).optional(),
  status: z.literal('TERMINATED').optional(),
  expireDate: z.iso.date().optional(),
});
export type CreatePropertyInput = z.infer<typeof PropertySchema>;
export type CreateLeaseInput = z.infer<typeof LeaseSchema>;
export type UpdateLeaseInput = z.infer<typeof UpdateLeaseSchema>;
