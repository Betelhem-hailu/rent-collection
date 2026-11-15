import { z } from 'zod';
import { PhoneSchema } from '../../shared/phone.js';

export const PropertySchema = z.object({ description: z.string().trim().min(1), location: z.string().trim().min(1), rooms: z.coerce.number().int().positive(), size: z.coerce.number().positive(), propertyTypeId: z.coerce.number().int().positive() });

export const LeaseDetailsSchema = z.object({
  rentAmount: z.union([z.number(), z.string().regex(/^\d+(?:\.\d{1,2})?$/).transform(Number)]).pipe(z.number().positive().max(1e12).refine(n => /^\d+(?:\.\d{1,2})?$/.test(String(n)), 'Rent must have at most two decimal places')),
  paymentPeriod: z.enum(['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY']).default('MONTHLY'),
  startDate: z.iso.date(),
  expireDate: z.iso.date(),
  gracePeriod: z.number().int().nonnegative().max(365).default(5),
  terms: z.string().max(10000).default(''),
});

export const LeaseSchema = LeaseDetailsSchema.extend({
  propertyId: z.string().min(1).max(128),
  tenantName: z.string().trim().min(2).max(120),
  tenantPhone: PhoneSchema,
}).refine(d => d.expireDate > d.startDate, 'End date must follow start date')
  .refine(d => Number(d.expireDate.slice(0, 4)) - Number(d.startDate.slice(0, 4)) <= 50, 'Lease must not exceed 50 years');

export const TenantLookupSchema = z.object({ phone: PhoneSchema });
export const UpdateLeaseSchema = z.object({
  rentAmount: LeaseDetailsSchema.shape.rentAmount.optional(),
  paymentPeriod: z.enum(['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY']).optional(),
  startDate: z.iso.date().optional(),
  gracePeriod: z.number().int().nonnegative().max(365).optional(),
  terms: z.string().max(10000).optional(),
  status: z.literal('TERMINATED').optional(),
  expireDate: z.iso.date().optional(),
}).strict()
  .refine(patch => Object.values(patch).some(value => value !== undefined), 'Provide at least one lease field to update')
  .refine(patch => !patch.status || Object.entries(patch).every(([key, value]) => key === 'status' || value === undefined), 'Terminate a lease separately from other changes');
export type CreatePropertyInput = z.infer<typeof PropertySchema>;
export type CreateLeaseInput = z.infer<typeof LeaseSchema>;
export type UpdateLeaseInput = z.infer<typeof UpdateLeaseSchema>;
