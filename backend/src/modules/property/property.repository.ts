import { prisma } from "../../shared/database/prisma.service.js";

export class PropertyRepository {
    async findById(id: string) {
        return prisma.orm.public.Property.where({
            id 
        });
    }

    async create(data: any) {
        return prisma.orm.public.Property.create({
            location: data.location,
            size: data.size,
            landlordId: data.ownerId,
            propertyTypeId: data.propertyTypeId,
            description: data.description,
            rooms: data.rooms,
            isActive:true,
        });
    }
}