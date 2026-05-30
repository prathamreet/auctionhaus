import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as bidController from './bid.controller';
import * as autoBidController from '../auto-bid/auto-bid.controller';
import * as commitmentService from './commitment.service';
import { authenticate, AuthRequest } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

// Bidding
router.post('/auctions/:auctionId', bidController.placeBid);
router.get('/auctions/:auctionId', bidController.getAuctionBids);

// Auto-bidding
router.get('/auctions/:auctionId/auto-bid', autoBidController.getMyAutoBid);
router.post('/auctions/:auctionId/auto-bid', autoBidController.setAutoBid);
router.delete('/auctions/:auctionId/auto-bid', autoBidController.cancelAutoBid);

// Phase C6: cryptographic sealed-bid commitments
router.post(
  '/auctions/:auctionId/commit',
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { commitHash } = z.object({ commitHash: z.string().length(64) }).parse(req.body);
      const result = await commitmentService.commitBid({
        auctionId: req.params.auctionId,
        bidderId: req.user!.id,
        commitHash,
      });
      res.status(201).json(result);
    } catch (err) { next(err); }
  }
);

router.post(
  '/auctions/:auctionId/reveal',
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const body = z.object({
        amount: z.number().positive(),
        nonce: z.string().min(8),
      }).parse(req.body);
      const result = await commitmentService.revealBid({
        auctionId: req.params.auctionId,
        bidderId: req.user!.id,
        ...body,
      });
      res.json(result);
    } catch (err) { next(err); }
  }
);

router.get(
  '/auctions/:auctionId/commitments',
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const commitments = await commitmentService.getCommitments(req.params.auctionId);
      res.json({ commitments });
    } catch (err) { next(err); }
  }
);

export default router;
