import type { LandlordRepository } from './landlord.repository.js';
import { PropertySchema, LeaseSchema, TenantLookupSchema, UpdateLeaseSchema, UpdatePropertyInfoSchema, UpdatePropertyImageSchema } from './landlord.dto.js';
import { LandlordError } from './landlord.error.js';
import { validateLeaseUpdate } from '../lease/lease-update.js';
import { dateOnly, today } from '../billing/billing.js';
export { LandlordError } from './landlord.error.js';

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
    const leases = await this.repository.listLeases(userId);
    const leaseIds = leases.map(l => l.id);
    // Reuse the warm connection rather than opening a connection burst on every overview.
    const tenants = await this.repository.listTenants(userId);
    const billingPeriods = (await this.repository.listBillingPeriods(leaseIds))
      .map(bill => ({ ...bill, startPeriod: dateOnly(bill.startPeriod), endPeriod: dateOnly(bill.endPeriod) }));
    const payments = await this.repository.listPayments(leaseIds);
    const propertyTypes = await this.repository.listPropertyTypes();
    const user = await this.repository.findUser(userId);
    return { properties, leases, tenants, billingPeriods, payments, propertyTypes, name: user?.name, businessDate: today() };
  }

  async createProperty(userId: string, input: unknown) {
    const data = PropertySchema.parse(input);
    if (!await this.repository.findPropertyType(data.propertyTypeId)) throw new LandlordError(400, 'Invalid property type');
    return this.repository.createProperty(userId, data);
  }

  async updatePropertyInfo(userId: string, id: string, input: unknown) {
    const patch = UpdatePropertyInfoSchema.parse(input);
    if (!await this.repository.findOwnedProperty(id, userId)) throw new LandlordError(404, 'Property not found');
    if (patch.propertyTypeId !== undefined && !await this.repository.findPropertyType(patch.propertyTypeId)) throw new LandlordError(400, 'Invalid property type');
    await this.repository.updatePropertyInfo(id, userId, patch);
    return { success: true };
  }

  async updatePropertyImage(userId: string, id: string, input: unknown) {
    const { imageData } = UpdatePropertyImageSchema.parse(input);
    if (!await this.repository.findOwnedProperty(id, userId)) throw new LandlordError(404, 'Property not found');
    await this.repository.updatePropertyImage(id, userId, imageData);
    return { success: true };
  }

  async tenants(userId: string, landlordId: string) {
    if (landlordId !== userId) throw new LandlordError(404, 'Landlord not found');
    return this.repository.listTenants(userId);
  }

  async findTenant(landlordId: string, input: unknown) {
    const { phone } = TenantLookupSchema.parse(input);
    const user = (await this.repository.listTenants(landlordId)).find(tenant => tenant.phone === phone);
    if (!user) throw new LandlordError(404, 'No tenant linked to your leases with this phone number');
    return user;
  }

  async createLease(userId: string, input: unknown) {
    const source = input as Record<string, unknown> | null;
    const data = LeaseSchema.parse({ ...source, rentAmount: source?.rentAmount ?? source?.amount });
    return this.handleLeaseTenantBinding(userId, data.propertyId, data.tenantName, data.tenantPhone, data);
  }

  async handleLeaseTenantBinding(landlordId: string, propertyId: string, tenantName: string, tenantPhone: string, leaseDetails: unknown) {
    const source = leaseDetails as Record<string, unknown> | null;
    const details = LeaseSchema.parse({ ...source, rentAmount: source?.rentAmount ?? source?.amount, propertyId, tenantName, tenantPhone });
    return this.repository.createLease(landlordId, details);
  }

  async updateLease(userId: string, id: string, input: unknown) {
    const patch = UpdateLeaseSchema.parse(input);
    const lease = await this.repository.findLease(id);
    if (!lease || lease.landlordId !== userId || !await this.repository.findOwnedProperty(lease.propertyId, userId)) throw new LandlordError(404, 'Lease not found');
    validateLeaseUpdate(lease, patch);
    await this.repository.updateLease(userId, lease.id, patch);
    return { success: true };
  }
}
