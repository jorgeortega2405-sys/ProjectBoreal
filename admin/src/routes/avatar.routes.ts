import { handleAvatarRequest } from '../controllers/avatar.controller.js';
import { Router } from 'express';

const router = Router();

router.get('/avatar', handleAvatarRequest);
router.get('/avatar.svg', handleAvatarRequest);
router.get('/', handleAvatarRequest);
router.get('', handleAvatarRequest);

export default router;
