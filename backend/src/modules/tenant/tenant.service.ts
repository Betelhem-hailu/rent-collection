import { HttpError } from '../../shared/http.js';
import type { TenantRepository } from './tenant.repository.js';
import { dateOnly } from '../billing/billing.js';

export const NO_ACTIVE_LEASE_MESSAGE = 'You currently have no active rental agreements linked to this phone number.';

export class TenantService {
  constructor(private readonly repository: TenantRepository) {}

  async overview(userId: string | undefined, activeOnly = true) {
    if (!userId) throw new HttpError(401, 'Please sign in');
    const user = await this.repository.findUser(userId);
    if (!user?.isActive || user.authState === 'UNINITIALIZED') throw new HttpError(403, 'Active verified account required');
    const leases = await this.repository.listLeases(user.id, activeOnly);
    // A registered landlord may also rent a property. The lease grants access
    // to that user's own rental data without changing their global role.
    if (user.role !== 'TENANT' && leases.length === 0) throw new HttpError(403, 'Tenant access required');
    const data = await this.repository.rentalData(user.id, leases);
    const billingPeriods = data.billingPeriods.map(bill => ({ ...bill, startPeriod: dateOnly(bill.startPeriod), endPeriod: dateOnly(bill.endPeriod) }));
    return { leases, ...data, billingPeriods, hasActiveLease: activeOnly ? leases.length > 0 : undefined, message: activeOnly && !leases.length ? NO_ACTIVE_LEASE_MESSAGE : null };
  }
}
