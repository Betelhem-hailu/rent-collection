import { Router } from "express";
import * as AuthController from "./auth.controller.js";
import { createActivationRouter } from './activation.routes.js';
// import { authMiddleware } from "./auth.middleware.js";

const router = Router();
router.use('/auth/tenant/activation', createActivationRouter());

//router.get('/auth/me', authMiddleware, AuthController.getCurrentUser);
router.post('/auth/login', AuthController.login);
router.post('/auth/tenant/login', AuthController.tenantLogin);
router.post('/auth/register', AuthController.register);

export default router;
