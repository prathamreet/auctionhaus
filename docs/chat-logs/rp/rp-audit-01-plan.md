# Publication Plan: Atomic Ladder Paper

> Goal: Take `paper/auto-bid-ladder.tex` from draft to submission-ready for both
> college internal submission and a peer-reviewed venue (IEEE student conference
> or open-access journal).

---

## Current State Assessment

### What Already Exists (in `paper/auto-bid-ladder.tex`)

| Section | Status | Quality |
|---|---|---|
| Abstract | Written | Strong -- clear contribution claim, mentions all 3 properties |
| Introduction | Written | Strong -- motivates the problem precisely, cites the right gap |
| Related Work | Written | Solid -- Vickrey, Roth-Ockenfels, Bernstein, Gray-Reuter, Kleppmann |
| System Model (P1-P5) | Written | Strong -- 5 formal properties cleanly stated |
| Protocol (Algorithm 1) | Written | Strong -- full pseudocode with line numbers |
| Correctness (3 Theorems) | Written | Good -- proofs are sketch-level but logically sound |
| Evaluation (Tables I-III) | Written | **PLACEHOLDER NUMBERS** -- not from real benchmarks |
| Discussion | Written | Good -- covers trade-offs, anti-sniping, re-delivery |
| Conclusion | Written | Good |
| References | 12 entries | Solid academic references |

### What Is Missing

1. **Real benchmark numbers** -- Tables I, II, III have placeholder data, not actual k6 measurements
2. **System context section** -- the paper jumps straight to the ladder without telling
   the reader what AuctionHaus is (auction types, tech stack, scale)
3. **Figures** -- zero figures in a 6-page paper (reviewers expect at least 2-3)
4. **Author information** -- placeholder names
5. **Architecture diagram** -- no visual of how the ladder fits into the overall system
6. **Threat model / broader security context** -- the paper mentions lock ordering but
   not the broader financial integrity story (Decimal money, escrow settlement, etc.)
7. **College-specific formatting** -- your college likely has a template or cover page requirement

---

## Execution Plan

### Phase 1: Content That Only You Can Do (Your Team)

These require running actual software, making authorship decisions, or providing
information I cannot generate.

#### 1A. Run the k6 Benchmarks (CRITICAL -- blocks everything)

The benchmark harness exists at `packages/simulator/k6/bid-throughput.js`. You need
to run it against all three implementations and collect real numbers.

**Steps:**
1. Ensure backend is running with PostgreSQL and Redis locally
2. Seed the database with test accounts (`npx prisma db seed`)
3. Run each scenario 5 times for 60 seconds each:
   - Single-Jump implementation (you may need to temporarily swap the worker logic)
   - Recursive implementation (the old `processAutoBids` -- keep a git stash of it)
   - Atomic Ladder (current production code)
4. For each run, record:
   - Throughput (bids/second)
   - p50 latency (ms)
   - p99 latency (ms)
5. For the determinism test: run the same input 5 times per implementation, hash the
   resulting bid log, count distinct hashes
6. For the log fidelity test: with a ladder of nominal length K=8, count actual rows
   produced per implementation

**Output:** A spreadsheet or JSON with real numbers to replace Tables I, II, III.

> [!IMPORTANT]
> If you cannot implement all three variants for benchmarking, an honest alternative
> is to benchmark only the Atomic Ladder under varying concurrency (1, 10, 50, 100
> bidders) and discuss the other two theoretically. This is weaker but still publishable.
> State clearly in the paper that the recursive and single-jump numbers are projected
> from code analysis, not measured.

#### 1B. Fill In Author and Institutional Details

- Replace all `[Author Name]`, `[University Name]`, `[College Name]` placeholders
- Decide author order (convention: primary contributor first, supervisor last)
- Add your HOD/supervisor as corresponding author if your college requires it
- Add ORCID IDs if any team member has one

#### 1C. Decide Publication Venue

| Venue Type | Examples | Page Limit | Review Time | Difficulty |
|---|---|---|---|---|
| **College internal journal** | Your department's own proceedings | Varies | 1-2 weeks | Low |
| **IEEE Student Conference** | ICSCCC, ICCMC, ICECCT, ICICICT | 6 pages | 4-8 weeks | Medium |
| **Open-access journal** | IEEE Access (expensive), IJERT, IRJET | 8-15 pages | 2-6 weeks | Medium-Low |
| **Springer LNCS workshop** | Attached to ICDCN, COMSNETS | 10-12 pages | 6-10 weeks | Medium-High |

**Recommendation:** Submit to an **IEEE student conference** (6-page limit, matches
your paper length exactly). These have acceptance rates of 40-60% for student papers
and the review feedback is constructive. Simultaneously submit to your college's
internal journal for guaranteed publication.

---

### Phase 2: Content I Can Write For You (Code + Writing)

These are things I can do in our working sessions.

#### 2A. Add a System Context Section (Section III-A)

Insert a brief (half-page) subsection between Related Work and System Model that
describes AuctionHaus as a whole:
- Three auction types (English, Dutch, Sealed-Bid)
- Tech stack table (Node.js, PostgreSQL, Prisma, Redis, BullMQ, Socket.io, Next.js)
- One architecture diagram (text-based or tikz)
- Scale target (tens of concurrent bidders per auction, not thousands)
- Where the ladder fits: BullMQ worker triggered after every manual bid

**Why:** Reviewers need context. The current paper assumes the reader knows AuctionHaus.

#### 2B. Absorb the Best Parts of ResearchPaper-01.docx

From your team's draft, the following sections are well-written and add value to the
ladder paper:

| Source (ResearchPaper-01) | Target (auto-bid-ladder.tex) | How |
|---|---|---|
| Section IV.C (Anti-Sniping) | Discussion, subsection 7.2 | Expand the existing anti-sniping paragraph with the mechanism detail |
| Section VI.A-C (Socket.io architecture) | New subsection in Section IV or VI | Brief description of how `bid:ladder` event reaches clients |
| Section VII.B (Concurrency Control explanation) | Section III (System Model) | The plain-English explanation of why FOR UPDATE matters is clearer than what the ladder paper has |
| Section IX paragraph on React Query bug | Discussion (Limitations) | Honest bug reporting impresses reviewers |

#### 2C. Create Figures

The paper needs 2-3 figures minimum:

1. **Figure 1: System Architecture Diagram**
   - Shows: Client -> REST API -> BullMQ Queue -> Ladder Worker -> PostgreSQL
   - Shows: Socket.io broadcast path after ladder commits
   - Format: tikz or a clean diagram

2. **Figure 2: Ladder Execution Timeline**
   - A visual trace of a 4-rung ladder: trigger bid at t0, rungs at t1-t4, commit at t5
   - Shows lock acquisition, wallet movements, bid row insertions
   - Contrasts with single-jump (one row) and recursive (partial commits)

3. **Figure 3: Throughput Comparison Chart**
   - Bar chart or line plot: 3 implementations x 3 concurrency levels
   - Generated from the real benchmark data (Phase 1A)

#### 2D. Strengthen the Evaluation Section

- Replace placeholder numbers with real data from Phase 1A
- Add a paragraph interpreting each table (what does the data mean?)
- Add a "Threats to Validity" subsection (single-host measurement, synthetic workload,
  small auto-bid pool) -- this is expected in systems papers and shows maturity

#### 2E. Expand the Conclusion

- Summarize the three key findings from the evaluation
- Restate the contribution in one crisp sentence
- Keep the future work (portfolio resolver, TLA+ verification, distributed deployment)

#### 2F. Fix Reference [9] Duplicate

Reference [9] in the team draft is a duplicate of [3] (RFC 6455 appears twice).
The ladder paper's references are clean but should be checked for completeness.

---

### Phase 3: Final Polish

#### 3A. IEEE Formatting Compliance

- Ensure the paper compiles cleanly with `IEEEtran.cls`
- Check: 6 pages maximum (IEEE conference) or 8 pages (journal)
- Check: all figures are referenced in text
- Check: all tables have captions above them
- Check: references are in IEEE style (numbered, square brackets)
- Check: no orphan/widow lines

#### 3B. Plagiarism Check

- Run through Turnitin or iThenticate (your college likely provides access)
- The pseudocode and theorem statements are original -- no issues expected
- The related work section paraphrases rather than quotes -- good
- Target: below 15% similarity (standard threshold)

#### 3C. Peer Review Within Team

Before external submission:
1. Each team member reads the full paper and flags anything they cannot defend in a viva
2. Your HOD/supervisor reviews for technical accuracy
3. One non-CS friend reads the abstract and introduction -- if they cannot understand
   the problem statement, rewrite it

#### 3D. Prepare Submission Package

Depending on venue:
- **IEEE conference:** Submit PDF via EDAS or EasyChair. May require a separate
  copyright form (IEEE eCF). Some conferences require a video presentation.
- **College journal:** Follow your department's submission template. Usually a Word
  doc or PDF + cover letter.
- **Open-access journal:** Submit via the journal's portal. Often requires a cover
  letter explaining the contribution and confirming originality.

---

## Timeline

| Week | Task | Who | Deliverable |
|---|---|---|---|
| **Week 1** | 1A: Run benchmarks, collect real numbers | Your team | Spreadsheet with throughput/latency/determinism/fidelity data |
| **Week 1** | 1B: Fill author details | Your team | Updated .tex with real names |
| **Week 1** | 1C: Pick 2 venues (college + external) | Your team | Decision |
| **Week 1** | 2A-2B: System context section + absorb draft prose | Me | Updated .tex |
| **Week 2** | 2C: Create figures (architecture, timeline, chart) | Me (diagrams) + You (chart data) | 3 figures in paper/figures/ |
| **Week 2** | 2D-2F: Evaluation rewrite, conclusion, reference fix | Me | Updated .tex |
| **Week 2** | 3A: IEEE formatting pass | Me | Clean-compiling .tex |
| **Week 3** | 3B: Plagiarism check | Your team (Turnitin access) | Report < 15% |
| **Week 3** | 3C: Internal peer review | Your team + HOD | Feedback incorporated |
| **Week 3** | 3D: Submit to college journal | Your team | Submission confirmation |
| **Week 4** | 3D: Submit to IEEE conference | Your team | Submission confirmation |

---

## What Makes This Paper Defensible

When a reviewer asks "what is new here?", your answer is:

> "No published paper specifies the exact algorithm used by a production auction
> platform to resolve concurrent proxy bids while producing a complete bid log.
> Existing platforms either discard the intermediate steps (single-jump) or leave
> the implementation undocumented. We formalize five desired properties, present a
> protocol that satisfies all five inside a single serializable transaction, prove
> three correctness theorems, and measure the throughput cost of log fidelity
> against two alternative implementations."

That is a real, citable, verifiable contribution. It is narrow -- and that is a
strength, not a weakness. Narrow contributions with proofs and measurements are
what get published. Broad "we built a platform" papers are what get rejected.

---

## What You Should NOT Do

1. **Do not try to cram the fraud detection, sealed-bid commitments, and Redis
   sequencer into this paper.** Each of those is a separate contribution. Mixing
   them dilutes the clarity of the ladder paper. Save them for a second paper or
   for the project report.

2. **Do not inflate the evaluation.** If you can only benchmark 2 of 3
   implementations, say so. Reviewers respect honesty and punish fabrication.

3. **Do not submit to a predatory journal.** If a journal emails you unsolicited
   asking for submissions, it is predatory. Check Beall's List. Stick to IEEE,
   Springer, or your college's own proceedings.

4. **Do not delay submission waiting for perfection.** The paper is 85% done.
   The remaining 15% is benchmarks + figures + polish. Three weeks is enough.

---

## Immediate Next Step

Tell me which of the Phase 2 tasks you want me to start with:
- **(A)** Write the System Context section
- **(B)** Absorb the good parts from ResearchPaper-01.docx into the ladder paper
- **(C)** Create the figure descriptions / tikz diagrams
- **(D)** All of the above in one pass

Or if you want to tackle Phase 1A (benchmarks) first, I can help you set up the
k6 harness and the three implementation variants.
