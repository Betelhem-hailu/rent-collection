
import { LandlordRepository } from '../landlord/landlord.repository.js';
import { LandlordService } from '../landlord/landlord.service.js';

const service = new LandlordService(new LandlordRepository());

export function handleLeaseTenantBinding(
  landlordId: string, propertyId: string, tenantName: string, tenantPhone: string, leaseDetails: unknown,
) {
  return service.handleLeaseTenantBinding(landlordId, propertyId, tenantName, tenantPhone, leaseDetails);
}
