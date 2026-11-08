import { PropertyRepository } from "./property.repository.js";
import { PropertyService } from "./property.service.js";

const propertyService = new PropertyService(new PropertyRepository());

export const createProperty = async (req: any, res: any) => {
  try {
    const property = await propertyService.createProperty(req.body);
    res.status(201).json({ property });
  } catch (err: any) {
    res.status(500).json({ error: 'Something went wrong' });
  }
};

export const getPropertyById = async (req: any, res: any) => {
  try {
    const property = await propertyService.getPropertyById(req.params.id);
    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }
    res.status(200).json({ property });
  } catch (err: any) {
    res.status(500).json({ error: 'Something went wrong' });
  }
};