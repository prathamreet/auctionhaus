# Paper-Snapshot Simulator Runs

These three directories produced the model published in:

> *Real-Time Shill-Bidding Detection via Online Bid-Graph Analytics in Live Auction Platforms.* IEEE submission, 2026-06-01.

Specifically, every constant inside `back/src/modules/fraud/fraud.classifier.ts` (weights, normalisation parameters, threshold) and every metric in `paper/main.tex` Table I and `paper/supplementary.tex` sections 3.4, 4.4, and 5 was derived from the 70 bid events contained in these three runs.

## Run inventory (sorted by `startedAt`)

| Directory | Started | Bids in `events.jsonl` |
|---|---|---|
| `583abd37-9e08-43d6-9b80-5e8e8c46748e/` | 2026-06-01 08:21:16 UTC | first run |
| `7adb7e19-0964-4347-888c-03a8261ffadc/` | 2026-06-01 08:23:29 UTC | second run |
| `353c37c5-7bad-4a04-aa78-e846385249a0/` | 2026-06-01 08:25:56 UTC | third run (latest paper-era; eval auto-resolves here) |

Combined: 70 training examples (59 shill / 11 truthful), matching `paper/supplementary.tex` Table V exactly.

## Do not modify

- Do **not** delete or rename any of these directories.
- Do **not** edit `events.jsonl` or `manifest.json` inside them.
- Do **not** add new directories here; new sim runs go to the parent `runs/` folder, and post-paper improvements go to `_post-paper/`.

The paper-faithful trainer `packages/simulator/src/train.ts` reads from this directory when present (falling back to the parent only if `_paper-snapshot/` is missing). Re-running it with `--write --confirm` regenerates `fraud.classifier.ts` from these exact three runs and produces the paper's exact constants.

## Known methodological imperfection

The simulator at the time of submission only created one auction per run, and the training pipeline picked a fake `sellerId` (the first truthful agent's userId) for the `sellerCoOccurrence` feature. The corrected trainer (`train.v2.ts`) addresses both and is documented as a post-submission improvement; it never modifies this snapshot. See `reaching-rp.md` Categories B1/B2 for the full discussion.
