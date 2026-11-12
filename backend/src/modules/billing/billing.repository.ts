import { Temporal } from 'temporal-polyfill';
import { prisma } from '../../shared/database/prisma.service.js';
import { allocate, schedule, dateOnly, today, cents } from './billing.js';

type Database = Pick<typeof prisma, 'orm'>;
const instant = (date: string) => Temporal.Instant.from(date + 'T00:00:00Z');

// Every writer takes this same lease-row lock before changing bills, receipts or allocations.
export async function lockLease(tx: Database, leaseId: string) {
  await tx.orm.public.Lease.where({ id: leaseId }).update({ id: leaseId });
  const lease = await tx.orm.public.Lease.where({ id: leaseId }).first();
  if (!lease) throw new Error('Lease not found');
  return lease;
}

export async function syncBilling(tx: Database, leaseId: string) {
  const lease = await lockLease(tx, leaseId);
  const db = tx.orm.public;
  const existing = await db.BillingPeriod.where({ leaseId }).all();
  const expected = schedule(lease);
  const keep = new Set<string>();
  for (const bill of expected) {
    const old = existing.find(b => dateOnly(b.startPeriod) === bill.startPeriod);
    keep.add(old?.id || bill.id);
    if (!old) {
      await db.BillingPeriod.create({ ...bill, startPeriod: instant(bill.startPeriod), endPeriod: instant(bill.endPeriod), paidAmount: '0.00', paymentStatus: 'UNPAID' });
    } else if (cents(String(old.amount)) !== cents(bill.amount) || dateOnly(old.endPeriod) !== bill.endPeriod || old.urgencyStatus !== bill.urgencyStatus) {
      await db.BillingPeriod.where({ id: old.id }).update({ amount: bill.amount, endPeriod: instant(bill.endPeriod), urgencyStatus: bill.urgencyStatus });
    }
  }
  // Retain references/history for cancelled future bills, while removing their charge.
  for (const old of existing) if (!keep.has(old.id) && cents(String(old.amount)) !== 0n) {
    await db.BillingPeriod.where({ id: old.id }).update({ amount: '0.00' });
  }
  const bills = await db.BillingPeriod.where({ leaseId }).all();
  const payments = await db.Payment.where({ leaseId }).all();
  const plan = allocate(bills, payments);
  const oldAllocations = payments.length ? await db.PaymentAllocation.where(a => a.paymentId.in(payments.map(p => p.id))).all() : [];
  const same = oldAllocations.length === plan.allocations.length && plan.allocations.every(a => oldAllocations.some(old => old.paymentId === a.paymentId && old.billingPeriodId === a.billingPeriodId && cents(String(old.amountAllocated)) === cents(a.amountAllocated)));
  if (!same) {
    if (payments.length) await db.PaymentAllocation.where(a => a.paymentId.in(payments.map(p => p.id))).deleteAndCount();
    for (const allocation of plan.allocations) await db.PaymentAllocation.create(allocation);
  }
  for (const balance of plan.balances) {
    const old = bills.find(b => b.id === balance.id)!;
    if (cents(String(old.paidAmount)) !== cents(balance.paidAmount) || old.paymentStatus !== balance.paymentStatus) {
      await db.BillingPeriod.where({ id: balance.id }).update({ paidAmount: balance.paidAmount, paymentStatus: balance.paymentStatus });
    }
  }
  return { lease, bills: bills.map(b => ({ ...b, ...plan.balances.find(p => p.id === b.id)! })) };
}

export async function refreshBilling(leaseIds: string[]) {
  for (const leaseId of [...leaseIds].sort()) await prisma.transaction(tx => syncBilling(tx, leaseId));
}

export const effectiveTerminationDate = (_startDate: unknown, expireDate: unknown) => dateOnly(expireDate) < today() ? dateOnly(expireDate) : today();
