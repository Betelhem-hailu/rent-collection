import type { LandlordRepository } from './landlord.repository.js';
import { PropertySchema, LeaseSchema, TenantLookupSchema, UpdateLeaseSchema } from './landlord.dto.js';

export class LandlordError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export class LandlordService {
  constructor(private readonly repository: LandlordRepository) {}

  async authorize(userId?: string) {
    if (!userId) throw new LandlordError(401, 'Authentication required');
    const user = await this.repository.findUser(userId);
    if (!user?.isActive) throw new LandlordError(403, 'Active account required');
    if (!await this.repository.findLandlord(userId)) throw new LandlordError(403, 'Landlord access required');
  }

  async overview(userId: string) {
    const properties = await this.repository.listProperties(userId);
    const leases = await this.repository.listLeases(properties.map(p => p.id));
    const leaseIds = leases.map(l => l.id);
    const tenantIds = [...new Set(leases.map(l => l.tenantId))];
    const [tenants, billingPeriods, payments, propertyTypes, user] = await Promise.all([
      this.repository.listTenants(tenantIds),
      this.repository.listBillingPeriods(leaseIds),
      this.repository.listPayments(leaseIds),
      this.repository.listPropertyTypes(),
      this.repository.findUser(userId),
    ]);
    return { properties, leases, tenants, billingPeriods, payments, propertyTypes, name: user?.name };
  }

  async createProperty(userId: string, input: unknown) {
    const data = PropertySchema.parse(input);
    if (!await this.repository.findPropertyType(data.propertyTypeId)) throw new LandlordError(400, 'Invalid property type');
    return this.repository.createProperty(userId, data);
  }

  async findTenant(input: unknown) {
    const { phone } = TenantLookupSchema.parse(input);
    const user = await this.repository.findUserByPhone(phone);
    if (!user || !await this.repository.findTenant(user.id)) {
      throw new LandlordError(404, 'No registered tenant with this phone number');
    }
    return user;
  }

  async createLease(userId: string, input: unknown) {
    const data = LeaseSchema.parse(input);
    if (!await this.repository.findOwnedProperty(data.propertyId, userId)) throw new LandlordError(404, 'Property not found');
    if (!await this.repository.findTenant(data.tenantId)) throw new LandlordError(400, 'Tenant not found');
    return this.repository.createLease(data);
  }

  async updateLease(userId: string, id: string, input: unknown) {
    const patch = UpdateLeaseSchema.parse(input);
    const lease = await this.repository.findLease(id);
    if (!lease || !await this.repository.findOwnedProperty(lease.propertyId, userId)) throw new LandlordError(404, 'Lease not found');
    if (lease.status !== 'ACTIVE') throw new LandlordError(409, 'Only active leases can be changed');
    if (patch.expireDate && patch.expireDate <= String(lease.expireDate).slice(0, 10)) {
      throw new LandlordError(400, 'Renewal must extend the lease');
    }
    await this.repository.updateLease(lease.id, patch);
    return { success: true };
  }
}
