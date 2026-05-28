import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuctionStatus, AuctionType } from '@prisma/client';
import * as bidService from './bid.service';
import { processAutoBids } from '../auto-bid/auto-bid.service';
import { AuthRequest } from '../../middleware/auth.middleware';
import { prisma } from '../../lib/prisma';

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

    // Sealed-bid privacy: while a SEALED_BID auction is ACTIVE we must not
    // broadcast the amount or bidder. We still emit so subscribers know "a bid
    // happened" and can update counters, but the payload is redacted.
    const auctionMeta = await prisma.auction.findUnique({
      where: { id: auctionId },
      select: { type: true, status: true },
    });
    const isSealedLive =
      auctionMeta?.type === AuctionType.SEALED_BID &&
      auctionMeta?.status === AuctionStatus.ACTIVE;

    if (isSealedLive) {
      req.io?.to(`auction:${auctionId}`).emit('bid:new', {
        bid: {
          id: bid.id,
          createdAt: bid.createdAt,
          // amount + bidderId intentionally omitted
        },
        sealed: true,
      });
    } else {
      req.io?.to(`auction:${auctionId}`).emit('bid:new', {
        bid: {
          id: bid.id,
          amount: bid.amount,
          bidderId: bid.bidderId,
          createdAt: bid.createdAt,
        },
      });
    }

    // Trigger auto-bid engine for this auction
    processAutoBids(auctionId, bid.bidderId, bid.amount, req.io).catch(console.error);

    res.status(201).json(bid);
  } catch (err) {
    next(err);
  }
};

export const getAuctionBids = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const bids = await bidService.getAuctionBids(req.params.auctionId, req.user!.id);
    res.json({ bids });
  } catch (err) {
    next(err);
  }
};
