/**
 * Phase C6 — Cryptographic Sealed-Bid Commitments (W1)
 *
 * Protocol (two phases):
 *
 * ── COMMIT (during auction ACTIVE) ─────────────────────────────────────────
 *   Client generates a 32-byte random nonce, computes:
 *     commitHash = SHA-256(amountHex || ":" || nonce)
 *   where amountHex = Math.round(amount * 100).toString(16)   (cents, hex)
 *
 *   POST /api/bids/auctions/:id/commit  { commitHash }
 *   Server stores BidCommitment({ auctionId, bidderId, commitHash }).
 *   The server never learns the bid amount during the live phase — even if
 *   the database is compromised mid-auction, the amount is still hidden.
 *
 * ── REVEAL (after auction ENDED) ────────────────────────────────────────────
 *   POST /api/bids/auctions/:id/reveal  { amount, nonce }
 *   Server recomputes SHA-256(amountHex || ":" || nonce) and checks it equals
 *   the stored commitHash. If valid, marks isValid=true, records revealedAmount.
 *   The winner is the valid committed bid with the highest revealedAmount.
 *
 * Security properties:
 *   - Hiding: the hash reveals nothing about amount (SHA-256 is a one-way function).
 *   - Binding: the bidder cannot change amount after committing without
 *     breaking the hash (collision resistance of SHA-256).
 *   - Server-privacy: unlike the current SEALED_BID flow (which still stores
 *     amount in the bids table), commitments keep amounts server-side-private
 *     until the reveal phase.
 *
 * Limitation vs full Pedersen commitments: SHA-256 commitments don't support
 * range proofs (the server cannot verify amount >= reservePrice without
 * learning it). Pedersen + Bulletproof range proofs would fix this — deferred
 * to a future research extension (noted in the paper §6 Future Work).
 */

import { createHash } from 'crypto';
import { prisma } from '../../lib/prisma';
import { createError } from '../../middleware/error.middleware';
import { AuctionStatus, AuctionType } from '@prisma/client';
import { D } from '../../lib/decimal';

/** Verify the client-side hash algorithm matches server-side. */
export function hashCommitment(amountCents: number, nonce: string): string {
  const amountHex = amountCents.toString(16);
  return createHash('sha256')
    .update(`${amountHex}:${nonce}`)
    .digest('hex');
}

/** Convert a decimal bid amount to integer cents for hashing. */
function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export const commitBid = async (data: {
  auctionId: string;
  bidderId: string;
  commitHash: string;
}) => {
  const { auctionId, bidderId, commitHash } = data;

  // Validate auction: must be ACTIVE SEALED_BID
  const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
  if (!auction) throw createError('Auction not found', 404);
  if (auction.type !== AuctionType.SEALED_BID)
    throw createError('Commitments only apply to sealed-bid auctions', 400);
  if (auction.status !== AuctionStatus.ACTIVE)
    throw createError('Auction is not active', 400);
  if (auction.sellerId === bidderId)
    throw createError("Cannot bid on your own auction", 403);

  // Validate hash format (64-char hex string)
  if (!/^[0-9a-f]{64}$/.test(commitHash))
    throw createError('commitHash must be a 64-character lowercase hex SHA-256 digest', 400);

  // Upsert: a bidder may re-commit (updates their commitment before close)
  const commitment = await prisma.bidCommitment.upsert({
    where: { auctionId_bidderId: { auctionId, bidderId } },
    update: { commitHash, revealedAt: null, revealedAmount: null, revealedNonce: null, isValid: null },
    create: { auctionId, bidderId, commitHash },
  });

  return { commitmentId: commitment.id, committed: true };
};

export const revealBid = async (data: {
  auctionId: string;
  bidderId: string;
  amount: number;
  nonce: string;
}) => {
  const { auctionId, bidderId, amount, nonce } = data;

  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    select: { type: true, status: true, startingPrice: true, reservePrice: true },
  });
  if (!auction) throw createError('Auction not found', 404);
  if (auction.type !== AuctionType.SEALED_BID)
    throw createError('Not a sealed-bid auction', 400);
  if (auction.status !== AuctionStatus.ENDED)
    throw createError('Auction has not ended yet — reveal phase begins after close', 400);

  const commitment = await prisma.bidCommitment.findUnique({
    where: { auctionId_bidderId: { auctionId, bidderId } },
  });
  if (!commitment) throw createError('No commitment found for this bidder', 404);
  if (commitment.isValid !== null) throw createError('Already revealed', 400);

  // Verify the commitment
  const computed = hashCommitment(toCents(amount), nonce);
  const isValid = computed === commitment.commitHash;

  const updated = await prisma.bidCommitment.update({
    where: { id: commitment.id },
    data: {
      revealedAt: new Date(),
      revealedAmount: isValid ? D(amount) : null,
      revealedNonce: nonce,
      isValid,
    },
  });

  if (!isValid) {
    throw createError('Reveal failed: amount/nonce does not match your commitment', 400);
  }

  return {
    valid: true,
    amount,
    commitmentId: commitment.id,
    revealedAt: updated.revealedAt,
  };
};

export const getCommitments = async (auctionId: string) => {
  // Only return full reveals after auction ends; only count (no amounts) while active
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    select: { status: true },
  });
  if (!auction) throw createError('Auction not found', 404);

  const commitments = await prisma.bidCommitment.findMany({
    where: { auctionId },
    include: {
      bidder: { select: { id: true, name: true } },
    },
  });

  const isEnded = auction.status === AuctionStatus.ENDED;
  return commitments.map((c) => ({
    id: c.id,
    bidderId: c.bidderId,
    bidderName: isEnded ? c.bidder.name : null,
    commitHash: c.commitHash,
    isValid: c.isValid,
    revealedAmount: isEnded ? c.revealedAmount : null,
    revealedAt: c.revealedAt,
  }));
};
