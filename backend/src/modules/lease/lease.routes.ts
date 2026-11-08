import { Router } from "express";
import * as LeaseController from "./lease.controller.js";

const router = Router();

router.get('/lease/:id', LeaseController.getLeaseById);
router.post('/lease', LeaseController.createLease);

export default router;
