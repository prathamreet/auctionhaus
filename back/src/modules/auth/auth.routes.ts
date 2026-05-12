import { Router } from 'express';
import * as authController from './auth.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { strictRateLimiter } from '../../middleware/rateLimiter.middleware';

const router = Router();

router.post('/register', strictRateLimiter, authController.register);
router.post('/login', strictRateLimiter, authController.login);
router.get('/me', authenticate, authController.getMe);

export default router;
