import 'temporal-polyfill/global';
import { Temporal } from 'temporal-polyfill';
import { prisma } from '../../shared/database/prisma.service.js';
import type { CreatePaymentInput, ListPaymentsInput } from './payment.dto.js';

export class PaymentRepository {
  async findUser(id: string) {
    return prisma.orm.public.User.where({ id }).first();
  }

  async findLease(id: string) {
    return prisma.orm.public.Lease.where({ id }).first();
  }

  async findProperty(id: string) {
    return prisma.orm.public.Property.where({ id }).first();
  }

  async findAccessibleLeaseIds(userId: string) {
    const [tenantLeases, properties] = await Promise.all([
      prisma.orm.public.Lease.where({ tenantId: userId }).select('id').all(),
      prisma.orm.public.Property.where({ landlordId: userId }).select('id').all(),
    ]);
    const ownedLeases = properties.length
      ? await prisma.orm.public.Lease.where(lease => lease.propertyId.in(properties.map(property => property.id))).select('id').all()
      : [];
    return [...new Set([...tenantLeases, ...ownedLeases].map(lease => lease.id))];
  }

  async list(query: ListPaymentsInput, leaseIds?: string[]) {
    if (leaseIds?.length === 0) return [];
    let payments = prisma.orm.public.Payment;
    if (leaseIds) payments = payments.where(payment => payment.leaseId.in(leaseIds));
    if (query.leaseId) payments = payments.where({ leaseId: query.leaseId });
    return payments.orderBy([payment => payment.paymentDate.desc(), payment => payment.id.desc()])
      .limit(query.limit).offset(query.offset).all();
  }

  async findById(id: string) {
    return prisma.orm.public.Payment.where({ id }).first();
  }

  async findByTransactionRef(transactionRef: string) {
    return prisma.orm.public.Payment.where({ transactionRef }).first();
  }

  async create(data: CreatePaymentInput) {
    return prisma.orm.public.Payment.create({
      leaseId: data.leaseId,
      amount: data.amount,
      transactionRef: data.transactionRef,
      paymentMethod: data.paymentMethod,
      paymentDate: data.paymentDate ? Temporal.Instant.from(data.paymentDate) : Temporal.Now.instant(),
    });
  }
}
