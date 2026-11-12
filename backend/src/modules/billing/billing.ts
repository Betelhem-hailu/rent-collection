import { createHash } from 'node:crypto';
import { Temporal } from 'temporal-polyfill';

export function cents(value: string | number): bigint {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) throw new Error('Money must have at most two decimal places');
  return BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0'));
}

export function money(value: bigint): string {
  return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
}

export const dateOnly = (value: unknown) => String(value).slice(0, 10);
export const today = () => Temporal.Now.plainDateISO('Africa/Nairobi').toString();
export const stableId = (...parts: string[]) => createHash('sha256').update(parts.join(':')).digest('hex');

export type ScheduleLease = { id: string; amount: string | number; paymentPeriod: string; startDate: unknown; expireDate: unknown; gracePeriod: number };
export function schedule(lease: ScheduleLease, currentDate = today()) {
  const months = { MONTHLY: 1, QUARTERLY: 3, HALF_YEARLY: 6, YEARLY: 12 }[lease.paymentPeriod];
  if (!months) throw new Error('Unsupported billing frequency');
  const start = Temporal.PlainDate.from(dateOnly(lease.startDate));
  const end = Temporal.PlainDate.from(dateOnly(lease.expireDate));
  if (Temporal.PlainDate.compare(end, start) < 0) return [];
  const result = [];
  for (let index = 0; index < 1200; index++) {
    // Always add to the original anchor, so January 31 becomes February 28 then March 31.
    const from = start.add({ months: index * months });
    if (Temporal.PlainDate.compare(from, end) > 0) return result;
    const next = start.add({ months: (index + 1) * months });
    const through = Temporal.PlainDate.compare(next.subtract({ days: 1 }), end) > 0 ? end : next.subtract({ days: 1 });
    const cycleDays = from.until(next).days;
    const actualDays = from.until(through.add({ days: 1 })).days;
    const fullAmount = cents(lease.amount) * BigInt(months);
    const amount = (fullAmount * BigInt(actualDays) + BigInt(Math.floor(cycleDays / 2))) / BigInt(cycleDays);
    const graceEnds = from.add({ days: lease.gracePeriod }).toString();
    result.push({
      id: stableId('bill', lease.id, from.toString()), leaseId: lease.id,
      startPeriod: from.toString(), endPeriod: through.toString(), amount: money(amount),
      urgencyStatus: from.toString() > currentDate ? 'UPCOMING' as const : currentDate > graceEnds ? 'OVERDUE' as const : 'DUE' as const,
    });
  }
  throw new Error('Lease exceeds the maximum of 1200 billing periods');
}

export type AllocationBill = { id: string; amount: string | number; startPeriod: unknown };
export type AllocationPayment = { id: string; amount: string | number; paymentDate: unknown };
export function allocate(bills: AllocationBill[], payments: AllocationPayment[]) {
  const orderedBills = [...bills].sort((a, b) => String(a.startPeriod).localeCompare(String(b.startPeriod)) || a.id.localeCompare(b.id));
  const orderedPayments = [...payments].sort((a, b) => String(a.paymentDate).localeCompare(String(b.paymentDate)) || a.id.localeCompare(b.id));
  const paid = new Map(orderedBills.map(b => [b.id, 0n]));
  const allocations: { id: string; paymentId: string; billingPeriodId: string; amountAllocated: string }[] = [];
  for (const payment of orderedPayments) {
    let remaining = cents(payment.amount);
    for (const bill of orderedBills) {
      const outstanding = cents(bill.amount) - paid.get(bill.id)!;
      const amount = remaining < outstanding ? remaining : outstanding;
      if (amount <= 0n) continue;
      allocations.push({ id: stableId('allocation', payment.id, bill.id), paymentId: payment.id, billingPeriodId: bill.id, amountAllocated: money(amount) });
      paid.set(bill.id, paid.get(bill.id)! + amount);
      remaining -= amount;
      if (!remaining) break;
    }
  }
  return { allocations, balances: orderedBills.map(b => ({ id: b.id, paidAmount: money(paid.get(b.id)!), paymentStatus: paid.get(b.id)! >= cents(b.amount) ? 'PAID' as const : paid.get(b.id)! > 0n ? 'PARTIAL_PAID' as const : 'UNPAID' as const })) };
}
