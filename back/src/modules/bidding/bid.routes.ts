import { Router } from 'express';
import * as bidController from './bid.controller';
import * as autoBidController from '../auto-bid/auto-bid.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

// Bidding
router.post('/auctions/:auctionId', bidController.placeBid);
router.post('/auctions/:auctionId/stream', bidController.placeBidStream);
router.get('/auctions/:auctionId', bidController.getAuctionBids);

// Auto-bidding
router.get('/auctions/:auctionId/auto-bid', autoBidController.getMyAutoBid);
router.post('/auctions/:auctionId/auto-bid', autoBidController.setAutoBid);
router.delete('/auctions/:auctionId/auto-bid', autoBidController.cancelAutoBid);

// Phase C6: cryptographic sealed-bid commitments
router.post('/auctions/:auctionId/commit', bidController.commitBid);
router.post('/auctions/:auctionId/reveal', bidController.revealBid);
router.get('/auctions/:auctionId/commitments', bidController.getCommitments);

export default router;
