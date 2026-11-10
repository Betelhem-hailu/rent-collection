import { randomUUID } from 'node:crypto';
import { prisma } from "../../shared/database/prisma.service.js";

export class LeaseRepository {

    async findById(id: string) {
        return prisma.orm.public.Lease.where({
            id 
        });
    }

    async create(data: any) {
        return prisma.orm.public.Lease.create({
            id: randomUUID(),
            startDate: data.startDate,
            expireDate: data.expireDate,
            propertyId: data.propertyId,
            tenantId: data.tenantId,
            amount: data.rentAmount,
            status: 'ACTIVE',
            gracePeriod: data.gracePeriod,
            terms: data.terms,
            paymentPeriod: data.paymentPeriod,
        });
    }
}