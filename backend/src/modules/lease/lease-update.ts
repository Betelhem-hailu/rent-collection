import { cents, dateOnly, today } from '../billing/billing.js';
import { LandlordError } from '../landlord/landlord.error.js';
import type { UpdateLeaseInput } from '../landlord/landlord.dto.js';

type EditableLease = {
  status: string; amount: string | number; paymentPeriod: string; startDate: unknown; expireDate: unknown;
};

export function validateLeaseUpdate(lease: EditableLease, patch: UpdateLeaseInput, currentDate: unknown = today()) {
  if (lease.status !== 'ACTIVE') throw new LandlordError(409, 'Only active leases can be changed');
  const current = dateOnly(currentDate);
  const originalStart = dateOnly(lease.startDate);
  const originalEnd = dateOnly(lease.expireDate);
  const startDate = patch.startDate ?? originalStart;
  const endDate = patch.expireDate ?? originalEnd;
  if (patch.status === 'TERMINATED') return { startDate, endDate, changesSchedule: false, shortensTerm: false };
  if (endDate <= startDate) throw new LandlordError(400, 'End date must follow start date');
  if (Number(endDate.slice(0, 4)) - Number(startDate.slice(0, 4)) > 50) throw new LandlordError(400, 'Lease must not exceed 50 years');
  const changesSchedule = patch.rentAmount !== undefined && cents(patch.rentAmount) !== cents(String(lease.amount))
    || patch.paymentPeriod !== undefined && patch.paymentPeriod !== lease.paymentPeriod
    || startDate !== originalStart;
  if (changesSchedule && originalStart <= current) throw new LandlordError(409, 'Rent, billing frequency and start date can only be changed before the lease starts');
  if (startDate !== originalStart && startDate <= current) throw new LandlordError(400, 'Updated start date must be in the future');
  const shortensTerm = endDate < originalEnd;
  if (shortensTerm && originalStart <= current) throw new LandlordError(400, 'Use termination to end a lease early; an ongoing lease can only be extended');
  return { startDate, endDate, changesSchedule, shortensTerm };
}
