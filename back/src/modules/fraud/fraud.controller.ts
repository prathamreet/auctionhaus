import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../../middleware/auth.middleware';
import * as fraudService from './fraud.service';

// GET /api/fraud/flags
export const getFraudFlags = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      dismissed: z.coerce.boolean().optional().default(false),
      limit: z.coerce.number().int().positive().max(200).optional().default(50),
      auctionId: z.string().uuid().optional(),
      bidderId: z.string().uuid().optional(),
    });
    const query = schema.parse(req.query);

    const flags = await fraudService.getFraudFlags(query);
    res.json({ flags });
  } catch (err) {
    next(err);
  }
};

// GET /api/fraud/stats
export const getFraudStats = async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const stats = await fraudService.getFraudStats();
    res.json(stats);
  } catch (err) {
    next(err);
  }
};

// PUT /api/fraud/flags/:id/dismiss
export const dismissFlag = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const flag = await fraudService.dismissFlag(req.params.id);
    res.json({ flag });
  } catch (err) {
    next(err);
  }
};
