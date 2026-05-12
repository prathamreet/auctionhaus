import { Router } from 'express';
import * as bidController from './bid.controller';
import * as autoBidController from '../auto-bid/auto-bid.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

// Bidding
router.post('/auctions/:auctionId', bidController.placeBid);
router.get('/auctions/:auctionId', bidController.getAuctionBids);

// Auto-bidding
router.get('/auctions/:auctionId/auto-bid', autoBidController.getMyAutoBid);
router.post('/auctions/:auctionId/auto-bid', autoBidController.setAutoBid);
router.delete('/auctions/:auctionId/auto-bid', autoBidController.cancelAutoBid);

export default router;
