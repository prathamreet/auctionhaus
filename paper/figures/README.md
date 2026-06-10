# paper/figures — Data Artefacts Behind the Submitted Paper

This directory holds the JSON / text artefacts that back the figures and tables in the IEEE submission (`paper/main.tex`, `paper/supplementary.tex`). Each file is produced by the simulator pipeline or by the k6 load-test harness.

## Files

| File | Produced by | Backs |
|---|---|---|
| `roc_data.json` | `packages/simulator/src/eval.ts` | ROC curve in `paper/main.tex` Section VI.B |
| `ablation_data.json` | `packages/simulator/src/eval.ts` | Ablation table in `paper/main.tex` Table II and `paper/supplementary.tex` Table VIII |
| `k6_results.json` | Manual k6 invocations against the running backend | Throughput tables in `paper/main.tex` Table III and `paper/supplementary.tex` Table XII |
| `k6_summary.txt` | One k6 summary export (1-VU direct mode) | Spot-check only; superseded by `k6_results.json` as the canonical record |
| `fraud_perf.json` | `back/src/modules/fraud/fraud.engine.ts` performance histogram (Phase RP5) | "Sub-millisecond per bid" claim in `paper/main.tex` Section II |

## Canonical k6 numbers

`paper/main.tex` Table III and `paper/supplementary.tex` Table XII give slightly different values for the same six load-test runs (1, 10, 100 VUs in direct and stream modes). The supplementary table is the one that exactly matches the raw k6 console logs preserved at `docs/rp/rp-audit-01-plan-phase1A-k6.md` and `k6_results.json` in this directory.

Treat `k6_results.json` and the supplementary table as the source of truth. If the paper enters a revision round, the main paper Table III can be brought into line.

## Regeneration

```
# ROC + ablation:
npm run eval:fraud

# k6:
k6 run packages/simulator/k6/bid-throughput.js \
  -e SIM_TOKEN=<jwt> -e AUCTION_ID=<uuid> \
  -e VUS=<1|10|100> -e DURATION=15s -e MODE=<direct|stream>
```

The user runs every `npm` and `k6` command; this directory documents what each artefact represents and where its values appear in the paper.
