import type { PaymentRepository } from './payment.repository.js';
import { CreatePaymentSchema, ListPaymentsSchema, PaymentIdSchema } from './payment.dto.js';

export class PaymentError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

function isDuplicateReference(error: unknown): boolean {
  // Prisma wraps PostgreSQL errors; inspect the bounded cause chain too.
  for (let depth = 0; depth < 6 && error && typeof error === 'object'; depth++) {
    if ('code' in error && (error.code === '23505' || error.code === 'P2002')) return true;
    error = 'cause' in error ? error.cause : undefined;
  }
  return false;
}

export class PaymentService {
  constructor(private readonly repository: PaymentRepository) {}

  private async actor(userId?: string) {
    if (!userId) throw new PaymentError(401, 'Authentication required');
    const user = await this.repository.findUser(userId);
    if (!user || !user.isActive) throw new PaymentError(403, 'Account is inactive or unavailable');
    return user;
  }

  private async authorizeLease(user: { id: string; role: string }, leaseId: string, write = false) {
    const lease = await this.repository.findLease(leaseId);
    if (!lease) throw new PaymentError(404, 'Lease not found');
    if (user.role === 'ADMIN') return;
    const property = await this.repository.findProperty(lease.propertyId);
    if (property?.landlordId === user.id) return;
    if (!write && lease.tenantId === user.id) return;
    throw new PaymentError(403, 'You do not have access to payments for this lease');
  }

  async list(userId: string | undefined, input: unknown) {
    const user = await this.actor(userId);
    const query = ListPaymentsSchema.parse(input);
    if (query.leaseId) await this.authorizeLease(user, query.leaseId);
    const leaseIds = user.role === 'ADMIN' ? undefined : await this.repository.findAccessibleLeaseIds(user.id);
    return this.repository.list(query, leaseIds);
  }

  async getById(userId: string | undefined, input: unknown) {
    const user = await this.actor(userId);
    const payment = await this.repository.findById(PaymentIdSchema.parse(input));
    if (!payment) throw new PaymentError(404, 'Payment not found');
    await this.authorizeLease(user, payment.leaseId);
    return payment;
  }

  async create(userId: string | undefined, input: unknown) {
    const user = await this.actor(userId);
    const data = CreatePaymentSchema.parse(input);
    // This endpoint records received payments; tenants cannot confirm their own payments.
    await this.authorizeLease(user, data.leaseId, true);
    if (await this.repository.findByTransactionRef(data.transactionRef)) {
      throw new PaymentError(409, 'Transaction reference already exists');
    }
    try {
      return await this.repository.create(data);
    } catch (error) {
      if (isDuplicateReference(error)) throw new PaymentError(409, 'Transaction reference already exists');
      throw error;
    }
  }
}
