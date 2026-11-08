import z from "zod";


export const CreatePropertySchema = z.object({
    name: z.string().min(2, { message: "Property name is too short" }).max(100, { message: "Property name is too long" }),
    location: z.string().min(5, { message: "Address is too short" }).max(200, { message: "Address is too long" }),
    ownerId: z.string().uuid({ message: "Invalid owner ID" }),
    propertyTypeId: z.string().uuid({ message: "Invalid property type ID" }),
    description: z.string().max(1000, { message: "Description cannot exceed 1000 characters" }).optional(),
    rooms: z.number().int().min(1, { message: "There must be at least 1 room" }).max(100, { message: "Rooms cannot exceed 100" }),
    isActive: z.boolean().optional(),
    size: z.string()
    .regex(/^\d+(\.\d+)?$/, { message: "Size must be a valid number" })
    .refine((val) => parseFloat(val) > 0, {
      message: "Size must be in square feet and greater than zero",
    })
    .optional(),});