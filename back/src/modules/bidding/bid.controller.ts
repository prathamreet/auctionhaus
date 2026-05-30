import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuctionStatus, AuctionType } from '@prisma/client';
import * as bidService from './bid.service';
import { AuthRequest } from '../../middleware/auth.middleware';
import { prisma } from '../../lib/prisma';
import { BidSequencer } from './bid.sequencer';
import { createError } from '../../middleware/error.middleware';
import { D } from '../../lib/decimal';
import * as commitmentService from './commitment.service';

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

    // Phase A6: bid.service.placeBid already enqueues the auto-bid ladder onto
    // the auto-bid BullMQ queue after its tx commits. The controller used to
    // also kick off `processAutoBids` synchronously here -- that path is gone.

    res.status(201).json(bid);
  } catch (err) {
    next(err);
  }
};

export const placeBidStream = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      amount: z.number().positive(),
    });
    const { amount } = schema.parse(req.body);
    const auctionId = req.params.auctionId;

    // Validate auction existence & status prior to enqueuing
    const auction = await prisma.auction.findUnique({
      where: { id: auctionId },
    });
    if (!auction) throw createError('Auction not found', 404);
    if (auction.status !== AuctionStatus.ACTIVE) throw createError('Auction is not active', 400);
    if (auction.sellerId === req.user!.id) throw createError("Can't bid on your own auction", 403);
    
    const now = new Date();
    if (now > auction.endTime) throw createError('Auction has ended', 400);

    if (auction.type === AuctionType.ENGLISH) {
      const minBid = D(auction.currentPrice).add(auction.minIncrement);
      if (D(amount).lt(minBid)) {
        throw createError(`Minimum bid is ${minBid.toString()}`, 400);
      }
    } else if (auction.type === AuctionType.DUTCH) {
      if (!D(amount).eq(auction.currentPrice)) {
        throw createError(
          `Dutch auction bid must be exactly ${D(auction.currentPrice).toString()}`,
          400
        );
      }
    } else if (auction.type === AuctionType.SEALED_BID) {
      if (D(amount).lte(auction.startingPrice)) {
        throw createError(
          `Bid must be above starting price ${D(auction.startingPrice).toString()}`,
          400
        );
      }
    }

    const entryId = await BidSequencer.getInstance().enqueue(
      auctionId,
      req.user!.id,
      amount
    );

    res.status(202).json({
      message: 'Bid queued',
      auctionId,
      entryId,
    });
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

// Phase C6: cryptographic sealed-bid commitments
export const commitBid = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      commitHash: z.string().length(64),
    });
    const { commitHash } = schema.parse(req.body);
    const result = await commitmentService.commitBid({
      auctionId: req.params.auctionId,
      bidderId: req.user!.id,
      commitHash,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

export const revealBid = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      amount: z.number().positive(),
      nonce: z.string().min(8),
    });
    const body = schema.parse(req.body);
    const result = await commitmentService.revealBid({
      auctionId: req.params.auctionId,
      bidderId: req.user!.id,
      ...body,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const getCommitments = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const commitments = await commitmentService.getCommitments(req.params.auctionId);
    res.json({ commitments });
  } catch (err) {
    next(err);
  }
};
