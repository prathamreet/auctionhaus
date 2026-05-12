import { Response, NextFunction } from 'express';
import { z } from 'zod';
import * as bidService from './bid.service';
import { processAutoBids } from '../auto-bid/auto-bid.service';
import { AuthRequest } from '../../middleware/auth.middleware';

export const placeBid = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      amount: z.number().positive(),
    });
    const { amount } = schema.parse(req.body);
    const auctionId = req.params.auctionId;

    const bid = await bidService.placeBid({
      auctionId,
      bidderId: req.user!.id,
      amount,
    });

    // Emit real-time bid event
    req.io?.to(`auction:${auctionId}`).emit('bid:new', {
      bid: {
        id: bid.id,
        amount: bid.amount,
        bidderId: bid.bidderId,
        createdAt: bid.createdAt,
      },
    });

    // Trigger auto-bid engine for this auction
    processAutoBids(auctionId, bid.bidderId, bid.amount, req.io).catch(console.error);

    res.status(201).json(bid);
  } catch (err) {
    next(err);
  }
};

export const getAuctionBids = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const bids = await bidService.getAuctionBids(req.params.auctionId);
    res.json({ bids });
  } catch (err) {
    next(err);
  }
};
