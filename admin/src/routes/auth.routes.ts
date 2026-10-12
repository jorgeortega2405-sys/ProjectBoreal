import { login, logout, me } from '../controllers/auth.controller.js';
import { requireAdminAuth } from '../middlewares/auth.middleware.js';
import { createRateLimiter } from '../middlewares/rate-limit.middleware.js';
import { Router } from 'express';

const router = Router();

const loginLimiter = createRateLimiter({
  keyPrefix: 'login',
  maxRequests: 5,
  message: 'Demasiados intentos de acceso fallidos. Por favor espera 15 minutos antes de intentar nuevamente.',
  windowSeconds: 900,
});

router.post('/login', loginLimiter, login);
router.get('/me', me);
router.post('/logout', requireAdminAuth, logout);

export default router;
