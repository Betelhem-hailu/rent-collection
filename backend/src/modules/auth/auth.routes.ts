import { Router } from "express";
import * as AuthController from "./auth.controller.js";
// import { authMiddleware } from "./auth.middleware.js";

const router = Router();

// router.get('/auth/me', authMiddleware, AuthController.getCurrentUser);
router.post('/auth/login', AuthController.login);
router.post('/auth/register', AuthController.register);

export default router;