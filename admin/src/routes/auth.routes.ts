import authController from '../controllers/auth.controller.js';
import { Router } from 'express';

const router = Router();

router.post('/login', (req, res) => authController.login(req, res));
router.get('/me', (req, res) => authController.me(req, res));
router.post('/logout', (req, res) => authController.logout(req, res));

export default router;
