
export class LeaseService {
  constructor(private leaseRepository: any) {}
    async findLeaseById(id: string) {
        return this.leaseRepository.findById(id);
    }

    async createLease(data: any) {
        return this.leaseRepository.create(data);
    }
}