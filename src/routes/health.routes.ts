import { getHealthStatus } from '../controllers/health.controller.js';
import { Router } from 'express';

const router = Router();

router.get('/', getHealthStatus);

export default router;
