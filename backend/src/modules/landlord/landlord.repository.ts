import { randomUUID } from 'node:crypto';
import { Temporal } from 'temporal-polyfill';
import { prisma } from '../../shared/database/prisma.service.js';
import type { CreatePropertyInput, CreateLeaseInput, UpdateLeaseInput, UpdatePropertyInfoInput } from './landlord.dto.js';
import { syncBilling, refreshBilling, lockLease, effectiveTerminationDate } from '../billing/billing.repository.js';
import { LandlordError } from './landlord.error.js';
import { validateLeaseUpdate } from '../lease/lease-update.js';

const db = prisma.orm.public;

export class LandlordRepository {
  constructor(private readonly database = prisma) {}
  async findUser(id: string) {
    return db.User.where({ id }).select('isActive', 'name').first();
  }

  async findLandlord(userId: string) {
    return db.Landlord.where({ userId }).first();
  }

  async listProperties(landlordId: string) {
    return db.Property.where({ landlordId }).all();
  }

  async listLeases(landlordId: string) {
    return db.Lease.where({ landlordId }).all();
  }

  async listTenants(landlordId: string) {
    const leases = await db.Lease.where({ landlordId }).select('tenantUserId').all();
    const tenantIds = [...new Set(leases.map(lease => lease.tenantUserId))];
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

  async findOwnedProperty(id: string, landlordId: string) {
    return db.Property.where({ id, landlordId }).first();
  }

  async updatePropertyInfo(id: string, landlordId: string, patch: UpdatePropertyInfoInput) {
    await db.Property.where({ id, landlordId }).update({ ...patch, size: patch.size === undefined ? undefined : String(patch.size) });
  }

  async updatePropertyImage(id: string, landlordId: string, imageData: string | null) {
    await db.Property.where({ id, landlordId }).update({ imageData });
  }

  async findLease(id: string) {
    return db.Lease.where({ id }).first();
  }

  async createLease(landlordId: string, data: CreateLeaseInput) {
    const { rentAmount, tenantName, tenantPhone, ...leaseData } = data;
    return this.database.transaction(async tx => {
      const tables = tx.orm.public;
      const owner = await tables.User.where({ id: landlordId, role: 'LANDLORD', isActive: true }).first();
      if (!owner || !await tables.Landlord.where({ userId: landlordId }).first()) throw new LandlordError(403, 'Active landlord account required');
      // Serialize lease creation for this property to prevent overlapping tenancies.
      await tables.Property.where({ id: data.propertyId, landlordId, isActive: true }).update({ id: data.propertyId });
      if (!await tables.Property.where({ id: data.propertyId, landlordId, isActive: true }).first()) throw new LandlordError(404, 'Property not found');
      const existing = await tx.orm.public.Lease.where({ propertyId: data.propertyId }).all();
      if (existing.some(l => l.status === 'ACTIVE' && String(l.startDate).slice(0, 10) <= data.expireDate && String(l.expireDate).slice(0, 10) >= data.startDate)) {
        throw new LandlordError(409, 'Property already has an overlapping active lease');
      }
      // PostgreSQL's unique phone index resolves concurrent reservations atomically.
      // An empty update preserves the registered user's name, credentials and role.
      const tenant = await tables.User.upsert({
        conflictOn: { phone: tenantPhone },
        create: { id: randomUUID(), phone: tenantPhone, name: tenantName, role: 'TENANT', password: null, authState: 'UNINITIALIZED', isActive: true },
        update: {},
      });
      const lease = await tx.orm.public.Lease.create({
      ...leaseData,
      landlordId,
      tenantUserId: tenant.id,
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

  async updateLease(landlordId: string, id: string, patch: UpdateLeaseInput) {
    return this.database.transaction(async tx => {
      const db = tx.orm.public;
      const owner = await db.User.where({ id: landlordId, role: 'LANDLORD', isActive: true }).first();
      if (!owner || !await db.Landlord.where({ userId: landlordId }).first()) throw new LandlordError(403, 'Active landlord account required');
      const lease = await db.Lease.where({ id, landlordId }).first();
      if (!lease) throw new LandlordError(404, 'Lease not found');
      // Match creation's property -> lease lock order so edits cannot race a
      // new booking or a receipt against a partly recalculated schedule.
      await db.Property.where({ id: lease.propertyId, landlordId }).update({ id: lease.propertyId });
      if (!await db.Property.where({ id: lease.propertyId, landlordId }).first()) throw new LandlordError(404, 'Lease not found');
      const locked = await lockLease(tx, id);
      if (locked.landlordId !== landlordId) throw new LandlordError(404, 'Lease not found');
      const update = validateLeaseUpdate(locked, patch);
      if (update.changesSchedule || update.shortensTerm) {
        if (await db.Payment.where({ leaseId: id }).first()) throw new LandlordError(409, 'Rent, billing frequency and dates cannot be changed after a payment has been recorded; you can still extend the lease');
        if (await db.Checkout.where({ leaseId: id, status: 'PENDING' }).first()) throw new LandlordError(409, 'Resolve pending online payments before changing the rent or schedule');
      }
      if (!patch.status && (patch.startDate !== undefined || patch.expireDate !== undefined)) {
        const others = await db.Lease.where({ propertyId: locked.propertyId }).all();
        if (others.some(l => l.id !== id && l.status === 'ACTIVE' && String(l.startDate).slice(0, 10) <= update.endDate && String(l.expireDate).slice(0, 10) >= update.startDate)) throw new LandlordError(409, 'Updated dates overlap another active lease');
      }
      const end = patch.status === 'TERMINATED' ? effectiveTerminationDate(locked.startDate, locked.expireDate) : patch.expireDate;
      const { rentAmount, startDate, expireDate: _expireDate, ...fields } = patch;
      const result = await db.Lease.where({ id, landlordId }).update({ ...fields,
        amount: rentAmount !== undefined ? String(rentAmount) : undefined,
        startDate: startDate ? Temporal.Instant.from(startDate + 'T00:00:00Z') : undefined,
        expireDate: end ? Temporal.Instant.from(end + 'T00:00:00Z') : undefined,
      });
      await syncBilling(tx, id);
      return result;
    });
  }
}
