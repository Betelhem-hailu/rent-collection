import z from "zod";

export const CreateLeaseSchema = z.object({
  propertyId: z.string().uuid({ message: "Invalid property ID" }),
  tenantId: z.string().uuid({ message: "Invalid tenant ID" }),
    startDate: z.string().refine((date) => !isNaN(Date.parse(date)), {
        message: "Invalid start date",
    }),
    endDate: z.string().refine((date) => !isNaN(Date.parse(date)), {
        message: "Invalid end date",
    }),
    rentAmount: z.number().positive({ message: "Rent amount must be a positive number" }),
    paymentPeriod: z.enum(['monthly', 'half-yearly' , 'quarterly', 'yearly'], 
        { message: "Payment frequency must be either 'monthly', 'quarterly', 'half yearly' or 'yearly'" }),
    terms: z.string().max(1000, { message: "Terms cannot exceed 1000 characters" }).optional(),
    gracePeriod: z.number().int().nonnegative({ message: "Grace period must be a non-negative integer" })
});