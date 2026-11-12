import { randomUUID } from 'node:crypto';
import { Temporal } from 'temporal-polyfill';
import { prisma } from '../../shared/database/prisma.service.js';
import type { CreatePropertyInput, CreateLeaseInput, UpdateLeaseInput } from './landlord.dto.js';
import { syncBilling, refreshBilling, lockLease, effectiveTerminationDate } from '../billing/billing.repository.js';
import { LandlordError } from './landlord.service.js';

const db = prisma.orm.public;

export class LandlordRepository {
  async findUser(id: string) {
    return db.User.where({ id }).select('isActive', 'name').first();
  }

  async findLandlord(userId: string) {
    return db.Landlord.where({ userId }).first();
  }

  async listProperties(landlordId: string) {
    return db.Property.where({ landlordId }).all();
  }

  async listLeases(propertyIds: string[]) {
    return propertyIds.length ? db.Lease.where(l => l.propertyId.in(propertyIds)).all() : [];
  }

  async listTenants(tenantIds: string[]) {
    return tenantIds.length ? db.User.where(u => u.id.in(tenantIds)).select('id', 'name', 'phone').all() : [];
  }

  async listBillingPeriods(leaseIds: string[]) {
    await refreshBilling(leaseIds);
    return leaseIds.length ? db.BillingPeriod.where(b => b.leaseId.in(leaseIds)).all() : [];
  }

  async listPayments(leaseIds: string[]) {
    return leaseIds.length ? db.Payment.where(p => p.leaseId.in(leaseIds)).all() : [];
  }

  async listPropertyTypes() {
    return db.PropertyType.all();
  }

  async findPropertyType(id: number) {
    return db.PropertyType.where({ id }).first();
  }

  async createProperty(landlordId: string, data: CreatePropertyInput) {
    return db.Property.create({ ...data, id: randomUUID(), size: String(data.size), landlordId, isActive: true });
  }

  async findUserByPhone(phone: string) {
    return db.User.where({ phone }).select('id', 'name', 'phone').first();
  }

  async findTenant(userId: string) {
    return db.Tenant.where({ userId }).first();
  }

  async findOwnedProperty(id: string, landlordId: string) {
    return db.Property.where({ id, landlordId }).first();
  }

  async findLease(id: string) {
    return db.Lease.where({ id }).first();
  }

  async createLease(data: CreateLeaseInput) {
    const { rentAmount, ...leaseData } = data;
    return prisma.transaction(async tx => {
      // Serialize lease creation for this property to prevent overlapping tenancies.
      await tx.orm.public.Property.where({ id: data.propertyId }).update({ id: data.propertyId });
      const existing = await tx.orm.public.Lease.where({ propertyId: data.propertyId }).all();
      if (existing.some(l => l.status === 'ACTIVE' && String(l.startDate).slice(0, 10) <= data.expireDate && String(l.expireDate).slice(0, 10) >= data.startDate)) {
        throw new LandlordError(409, 'Property already has an overlapping active lease');
      }
      const lease = await tx.orm.public.Lease.create({
      ...leaseData,
      id: randomUUID(),
      amount: String(rentAmount),
      startDate: Temporal.Instant.from(data.startDate + 'T00:00:00Z'),
      expireDate: Temporal.Instant.from(data.expireDate + 'T00:00:00Z'),
      status: 'ACTIVE',
      });
      await syncBilling(tx, lease.id);
      return lease;
    });
  }

  async updateLease(id: string, patch: UpdateLeaseInput) {
    return prisma.transaction(async tx => {
      const lease = await tx.orm.public.Lease.where({ id }).first();
      if (!lease) throw new LandlordError(404, 'Lease not found');
      await tx.orm.public.Property.where({ id: lease.propertyId }).update({ id: lease.propertyId });
      const locked = await lockLease(tx, id);
      if (locked.status !== 'ACTIVE') throw new LandlordError(409, 'Only active leases can be changed');
      if (patch.expireDate) {
        if (patch.expireDate <= String(locked.expireDate).slice(0, 10)) throw new LandlordError(400, 'Renewal must extend the lease');
        const others = await tx.orm.public.Lease.where({ propertyId: locked.propertyId }).all();
        if (others.some(l => l.id !== id && l.status === 'ACTIVE' && String(l.startDate).slice(0, 10) <= patch.expireDate! && String(l.expireDate).slice(0, 10) >= String(locked.startDate).slice(0, 10))) throw new LandlordError(409, 'Renewal overlaps another active lease');
      }
      const end = patch.status === 'TERMINATED' ? effectiveTerminationDate(locked.startDate, locked.expireDate) : patch.expireDate;
      const result = await tx.orm.public.Lease.where({ id }).update({ ...patch, expireDate: end ? Temporal.Instant.from(end + 'T00:00:00Z') : undefined });
      await syncBilling(tx, id);
      return result;
    });
  }
}
