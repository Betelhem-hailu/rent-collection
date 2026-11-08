import { Router } from "express";
import * as PropertyController from "./property.controller.js";

const router = Router();

router.get('/property/:id', PropertyController.getPropertyById);
router.post('/property', PropertyController.createProperty);

export default router;
