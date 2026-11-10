import { randomUUID } from 'node:crypto';
import { Temporal } from 'temporal-polyfill';
import { prisma } from '../../shared/database/prisma.service.js';
import type { CreatePropertyInput, CreateLeaseInput, UpdateLeaseInput } from './landlord.dto.js';

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
    return db.Lease.create({
      ...leaseData,
      id: randomUUID(),
      amount: String(rentAmount),
      startDate: Temporal.Instant.from(data.startDate + 'T00:00:00Z'),
      expireDate: Temporal.Instant.from(data.expireDate + 'T00:00:00Z'),
      status: 'ACTIVE',
    });
  }

  async updateLease(id: string, patch: UpdateLeaseInput) {
    return db.Lease.where({ id }).update({
      ...patch,
      expireDate: patch.expireDate ? Temporal.Instant.from(patch.expireDate + 'T00:00:00Z') : undefined,
    });
  }
}
