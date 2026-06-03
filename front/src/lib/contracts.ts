import { z } from "zod";

/**
 * Client-side mirrors of backend Zod schemas
 * (back/src/modules/<x>/<x>.controller.ts).
 *
 * Keep these IN SYNC by hand when the backend changes. The plan's eventual
 * packages/contracts/ split (after the repo split) replaces this file.
 */

// auth.controller.ts
export const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(50, "Name must be 50 characters or fewer"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

// user.controller.ts
export const updateProfileSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  avatar: z.string().url().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const rateUserSchema = z.object({
  rateeId: z.string().uuid(),
  auctionId: z.string().uuid(),
  score: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});
export type RateUserInput = z.infer<typeof rateUserSchema>;

// wallet.controller.ts
export const walletAmountSchema = z.object({
  amount: z.number().positive("Amount must be positive"),
});
export type WalletAmountInput = z.infer<typeof walletAmountSchema>;

// auction.controller.ts
export const AUCTION_TYPES = ["ENGLISH", "DUTCH", "SEALED_BID"] as const;
export type AuctionType = (typeof AUCTION_TYPES)[number];

export const createAuctionSchema = z
  .object({
    title: z
      .string()
      .min(3, "Title must be at least 3 characters")
      .max(200, "Title must be 200 characters or fewer"),
    description: z
      .string()
      .min(10, "Description must be at least 10 characters"),
    imageUrl: z.string().url("Must be a valid URL").optional(),
    type: z.enum(AUCTION_TYPES).default("ENGLISH"),
    startingPrice: z.number().positive("Starting price must be positive"),
    reservePrice: z.number().positive().optional(),
    buyNowPrice: z.number().positive().optional(),
    dutchPriceStep: z.number().positive().optional(),
    dutchInterval: z.number().int().positive().optional(),
    minIncrement: z.number().positive().default(1),
    antiSnipingMins: z.number().int().min(0).max(30).default(5),
    startTime: z.string().datetime().optional(),
    endTime: z.string().datetime().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.type === "DUTCH") {
      if (!val.dutchPriceStep) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["dutchPriceStep"],
          message: "Price drop step is required for Dutch auctions",
        });
      }
      if (!val.dutchInterval || val.dutchInterval < 60) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["dutchInterval"],
          message: "Drop interval must be at least 60 seconds",
        });
      }
    } else {
      if (!val.endTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["endTime"],
          message: "End time is required",
        });
      } else {
        const end = new Date(val.endTime);
        if (!isFinite(end.getTime()) || end <= new Date()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["endTime"],
            message: "End time must be in the future",
          });
        }
      }
    }
  });
export type CreateAuctionInput = z.infer<typeof createAuctionSchema>;

// bid.controller.ts
export const placeBidSchema = z.object({
  amount: z.number().positive("Bid amount must be positive"),
});
export type PlaceBidInput = z.infer<typeof placeBidSchema>;

// auto-bid.controller.ts
export const setAutoBidSchema = z.object({
  maxAmount: z.number().positive("Max amount must be positive"),
});
export type SetAutoBidInput = z.infer<typeof setAutoBidSchema>;

// watchlist.controller.ts
export const addWatchlistSchema = z.object({
  auctionId: z.string().uuid("Invalid auction id"),
});
export type AddWatchlistInput = z.infer<typeof addWatchlistSchema>;

/**
 * Pull field-level errors out of a ZodError into a flat
 * { fieldName: message } shape used by the useForm hook.
 */
export function zodIssuesToErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  const issues = err.issues ?? [];
  for (const issue of issues) {
    const key = issue.path.join(".") || "_root";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
