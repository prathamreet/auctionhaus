# Archive — Do Not Trust

Files in this folder were produced by previous AI sessions and contain aspirational claims that **do not match the actual code** as of the 2026-05-28 audit. They are kept only for historical reference.

The current source of truth is `/plan.md` at the repo root.

Specifically:
- `bible.md` — describes modules (`EscrowService`, `lib/decimal.ts`, `lib/logger.ts`, `userCache`, `auction.scheduler.ts` via node-cron, `scripts/db-hardening.ts`, `prisma/seed.ts`) that do not exist in `back/src` or `back/prisma`. Money is still `Float`, no `FOR UPDATE` locks anywhere.
- `back-learn.md` — same drift as bible; was at `back/learn.md`.
- `done.md` — checklist of "completed" hardening tasks (Phase 2.5, 2.7, 2.8, 2.9, 6) verified to be untrue: no row locks, no Decimal migration, no Winston logger, no GIN indexes, no central EscrowService, sealed-bid identity masking is still broken.
- `frontend_suggestion.md` — QA suggestions from an earlier session; some items are valid and have been folded into `plan.md` Phase B, others are stale.
- `jules-suggestion/` — earlier AI-generated reference material; reread only if explicitly needed.

If you need any of this content, find it here or in `git log`. Do not move it back to active directories.
