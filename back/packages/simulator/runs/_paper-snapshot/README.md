# Paper-Snapshot Simulator Runs (rejected submission — historical)

These three directories are the corpus behind the **first, rejected** IEEE submission (rejected on domain scope, 2026). They used the original single-auction-per-run simulator and a guessed `sellerId`, which made the seller-co-occurrence feature degenerate.

They are kept **only for provenance** — to show exactly what the first submission was trained on. They are **not** read by the current pipeline:

- `dataset.ts` / `train.ts` / `eval.ts` read active runs from the parent `runs/` directory and **skip any `_`-prefixed folder** (this one and `_post-paper`).
- These manifests have no `auctionOwners` field, so even if they were included they would be skipped with a warning.

## What changed for the resubmission

The rejected paper is no longer frozen, so the corrections that were previously deferred (to avoid fabricating published numbers) are now implemented:

- The simulator (`run.ts`) is multi-auction with a decoy second seller, so seller co-occurrence genuinely separates seller-affiliated fraud from organic bidders.
- `sellerCoOccurrence` is grounded in the real auction owner (`manifest.auctionOwners`) in `dataset.ts`.
- There is a deterministic held-out train/test split; `eval.ts` reports on the test set.
- Baselines are real (outbid-count + a best single-feature decision stump), not a straw man.

Generate the fresh corpus with `npm run sim:run` (several times), then `npm run train:fraud` and `npm run eval:fraud`. Fresh runs land in the parent `runs/` directory, not here.
