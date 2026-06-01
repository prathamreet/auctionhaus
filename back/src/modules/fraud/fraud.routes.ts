import { Router } from 'express';
import * as fraudController from './fraud.controller';
import { authenticate, requireAdmin } from '../../middleware/auth.middleware';

const router = Router();

// All fraud endpoints require an authenticated admin
router.use(authenticate, requireAdmin);

router.get('/flags', fraudController.getFraudFlags);
router.get('/stats', fraudController.getFraudStats);
router.put('/flags/:id/dismiss', fraudController.dismissFlag);

export default router;
