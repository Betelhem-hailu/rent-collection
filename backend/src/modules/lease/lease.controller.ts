import { LeaseRepository } from "./lease.repository.js";
import { LeaseService } from "./lease.service.js";

const leaseService = new LeaseService(new LeaseRepository());

export const createLease = async (req: any, res: any) => {
  try {
    const leaseData = req.body;
    const newLease = await leaseService.createLease(leaseData);
    res.status(201).json({ lease: newLease });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create lease' });
  }
};

export const getLeaseById = async (req: any, res: any) => {
    try {
        const leaseId = req.params.id;
        const lease = await leaseService.findLeaseById(leaseId);
        if (!lease) {
            return res.status(404).json({ error: 'Lease not found' });
        }
        res.status(200).json({ lease });
    } catch (err: any) {
        res.status(500).json({ error: 'Failed to retrieve lease' });
    }
}