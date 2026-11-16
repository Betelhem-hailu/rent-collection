import { prisma } from '../../shared/database/prisma.service.js';
import { refreshBilling } from '../billing/billing.repository.js';
import { today, dateOnly } from '../billing/billing.js';

const db = prisma.orm.public;

export class TenantRepository {
  findUser(id: string) { return db.User.where({ id }).first(); }

  async listLeases(tenantUserId: string, activeOnly: boolean) {
    const query = db.Lease.where({ tenantUserId });
    const leases = await (activeOnly ? query.where({ status: 'ACTIVE' }) : query).all();
    const currentDate = today();
    return activeOnly ? leases.filter(lease => dateOnly(lease.startDate) <= currentDate && dateOnly(lease.expireDate) >= currentDate) : leases;
  }

  async rentalData(tenantUserId: string, leases: { id: string; propertyId: string; landlordId: string }[]) {
    const ids = leases.map(lease => lease.id);
    if (!ids.length) return { properties: [], landlords: [], billingPeriods: [], payments: [], notifications: [], checkouts: [] };
    await refreshBilling(ids);
    const properties = await db.Property.where(property => property.id.in([...new Set(leases.map(lease => lease.propertyId))])).all();
    const propertyTypes = await db.PropertyType.all();
    const landlords = await db.User.where(user => user.id.in([...new Set(leases.map(lease => lease.landlordId))])).select('id', 'name', 'phone', 'email').all();
    const billingPeriods = await db.BillingPeriod.where(bill => bill.leaseId.in(ids)).all();
    const payments = await db.Payment.where(payment => payment.leaseId.in(ids)).all();
    const notifications = await db.Notification.where({ recipientId: tenantUserId }).where(notification => notification.leaseId.in(ids)).orderBy(notification => notification.createdAt.desc()).limit(100).all();
    const checkouts = await db.Checkout.where({ tenantUserId }).where(checkout => checkout.leaseId.in(ids)).orderBy(checkout => checkout.createdAt.desc()).limit(50).all();
    return { properties: properties.map(property => ({ ...property, propertyType: propertyTypes.find(type => type.id === property.propertyTypeId)?.name || 'Property' })), landlords, billingPeriods, payments, notifications, checkouts };
  }
}
