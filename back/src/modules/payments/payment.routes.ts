import { Router } from 'express';
import * as paymentController from './payment.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

// Winner confirms payment for auction
router.post('/auctions/:auctionId/confirm', paymentController.confirmPayment);

export default router;
