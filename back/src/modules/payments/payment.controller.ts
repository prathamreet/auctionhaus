import { Response, NextFunction } from 'express';
import * as paymentService from './payment.service';
import { AuthRequest } from '../../middleware/auth.middleware';

export const confirmPayment = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await paymentService.confirmWinnerPayment(
      req.params.auctionId,
      req.user!.id
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};
