import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../../middleware/auth.middleware';
import * as fraudService from './fraud.service';
import { FraudEngine } from './fraud.engine';

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

// GET /api/fraud/perf
// Returns the live per-bid scoring latency histogram (p50/p95/p99/max) over
// the most recent 1024 scoring events, plus the bid-graph memory footprint.
// Backs the paper claims:
//   - paper/main.tex Section II: "extra work per bid stays under a millisecond"
//   - paper/supplementary.tex Theorem 2: bid-graph memory bound
export const getFraudPerf = async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json(FraudEngine.getInstance().perfStats());
  } catch (err) {
    next(err);
  }
};

// POST /api/fraud/perf/reset
// Resets the latency histogram only; the bid-graph state is preserved.
// Useful before running a load test to capture a clean reservoir.
export const resetFraudPerf = async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    FraudEngine.getInstance().resetPerf();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};
