import { Response, NextFunction } from 'express';
import { z } from 'zod';
import * as walletService from './wallet.service';
import { AuthRequest } from '../../middleware/auth.middleware';

export const getWallet = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const wallet = await walletService.getWallet(req.user!.id);
    res.json(wallet);
  } catch (err) {
    next(err);
  }
};

export const deposit = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { amount } = z.object({ amount: z.number().positive() }).parse(req.body);
    const wallet = await walletService.deposit(req.user!.id, amount);
    res.json(wallet);
  } catch (err) {
    next(err);
  }
};

export const withdraw = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { amount } = z.object({ amount: z.number().positive() }).parse(req.body);
    const wallet = await walletService.withdraw(req.user!.id, amount);
    res.json(wallet);
  } catch (err) {
    next(err);
  }
};

export const getTransactions = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(100).default(20),
    });
    const { page, limit } = schema.parse(req.query);
    const result = await walletService.getTransactions(req.user!.id, page, limit);
    res.json(result);
  } catch (err) {
    next(err);
  }
};
