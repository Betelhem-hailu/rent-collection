
export class PropertyService {
  constructor(private propertyRepository: any) {}
    async createProperty(data: any) {
        return this.propertyRepository.create(data);
    }

    async getPropertyById(id: string) {
        return this.propertyRepository.findById(id);
    }
}