import { Router } from 'express';
import * as adminController from './admin.controller';
import { authenticate, requireAdmin } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticate, requireAdmin);

router.get('/dashboard', adminController.getDashboard);
router.get('/users', adminController.getAllUsers);
router.put('/users/:userId/suspend', adminController.suspendUser);
router.get('/auctions', adminController.getAllAuctions);
router.put('/auctions/:auctionId/moderate', adminController.moderateAuction);
router.get('/fraud-flags', adminController.getFraudFlags);

export default router;
