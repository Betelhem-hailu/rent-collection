import { z } from 'zod';
import { PhoneSchema } from '../../shared/phone.js';

// Store a bounded raster image with the property, so uploads survive restarts
// without relying on a publicly accessible local uploads directory.
export const PropertyImageSchema = z.string().max(700000).refine(value => {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return false;
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > 500000 || bytes.toString('base64') !== match[2]) return false;
  if (match[1] === 'jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (match[1] === 'png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
}, 'Choose a JPEG, PNG or WebP photo smaller than 500 KB');

export const PropertySchema = z.object({
  description: z.string().trim().min(1).max(1000), location: z.string().trim().min(1).max(500),
  rooms: z.coerce.number().int().positive(), size: z.coerce.number().positive(), propertyTypeId: z.coerce.number().int().positive(),
  imageData: PropertyImageSchema.optional(),
  utilities: z.array(z.string().trim().min(1).max(80).refine(value => !/[\r\n]/.test(value), 'Utility must be a single line')).max(20)
    .transform(values => [...new Set(values)].join('\n')).optional(),
  additionalUtilities: z.string().trim().max(1000).optional(),
});

export const UpdatePropertyInfoSchema = PropertySchema.omit({ imageData: true }).partial().strict()
  .refine(patch => Object.values(patch).some(value => value !== undefined), 'Provide at least one property field to update');
export const UpdatePropertyImageSchema = z.object({ imageData: PropertyImageSchema.nullable() }).strict();
export type UpdatePropertyInfoInput = z.infer<typeof UpdatePropertyInfoSchema>;

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
