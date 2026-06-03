# Research Paper Deliverables Summary

## What Was Created / Updated

### 1. `docs/rp/rp-content.md` -- Research Paper Content (NEW)

Complete section-by-section content for the Atomic Ladder paper, ready to transpose into LaTeX. Contains:

- All 8 sections (Abstract through Conclusion) rewritten with **real measured data**
- New **Section III (System Context)** that was identified as missing in the audit
- **6 Mermaid JS diagrams** ready for use in presentations or documents:
  1. System Architecture (bid flow from client through queue to broadcast)
  2. Three-implementation comparison (Single-Jump vs Recursive vs Atomic Ladder)
  3. Ladder execution timeline (4-rung sequence diagram)
  4. Lock-order invariant (visual of the global lock ordering)
  5. Throughput bar chart (Direct vs Sequencer at C=1,10,100)
  6. Fraud detection pipeline (for companion paper context)
- **3 data tables** with all real numbers

### 2. `paper/auto-bid-ladder.tex` -- LaTeX Paper (UPDATED)

Key changes:
- **Abstract**: Real numbers replace placeholders (975 bids/s, 32.5x improvement, p95=8.1ms)
- **Table I**: Replaced with measured k6 data (Direct vs Sequencer at 3 concurrency levels)
- **Evaluation text**: Analysis of measured results replaces generic placeholder commentary
- **Conclusion**: Updated with real performance claims
- Fixed `\rupee` to `Rs.` to prevent compilation errors

### 3. `paper/main.tex` -- Fraud Detection Paper (UPDATED)

Key changes:
- **Abstract**: F1=0.927 (was 0.83), threshold=0.05 (was 0.55), baseline F1=0.000 (was 0.51)
- **ROC curve**: Updated with actual (FPR, TPR) coordinates from `roc_data.json`
- **Ablation table**: Real measured values with P/R/F1 columns (reciprocity drops to F1=0.000)
- **Throughput table**: Real k6 p95 latencies (236ms / 1,284ms / 5,772ms vs 134ms / 48ms / 8.1ms)
- **Conclusion**: Updated to cite the reciprocity dominance finding

---

## Key Numbers (from Phase 1A runs)

### k6 Benchmarks

| Mode | C=1 | C=10 | C=100 |
|---|---|---|---|
| Direct bids/s | 3.5 | 9.5 | 30.0 |
| Direct p95 | 236ms | 1,284ms | 5,772ms |
| Sequencer bids/s | 5.7 | 92.8 | 975.0 |
| Sequencer p95 | 134ms | 48ms | 8.1ms |
| **Improvement** | **1.6x** | **9.8x** | **32.5x** |

### Fraud Classifier

| Metric | Baseline | LR Classifier |
|---|---|---|
| Precision | 0.000 | 0.864 |
| Recall | 0.000 | 1.000 |
| F1 | 0.000 | 0.927 |
| Threshold | --- | 0.05 |

### Critical Ablation Finding

Reciprocity is the single most important feature. Removing it collapses the classifier to F1=0.000. All other features individually contribute marginal improvements.

---

## Next Steps for the Team

1. **Fill in author names** -- Replace `[Author Name]`, `[University Name]` placeholders in both `.tex` files
2. **Compile and verify** -- Run `pdflatex auto-bid-ladder && bibtex auto-bid-ladder && pdflatex auto-bid-ladder` from `paper/`
3. **Plagiarism check** -- Run through Turnitin (target below 15%)
4. **Internal peer review** -- Each team member reads and flags anything they cannot defend
5. **Submit** -- College journal first, then IEEE student conference
