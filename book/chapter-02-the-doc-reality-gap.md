# Chapter 23 — The Documentation-Reality Gap

## A Cautionary Tale

One of the most useful things this project taught is not about algorithms or concurrency. It is about documentation.

At the start of the May 2026 audit, the repository had two documentation files that painted a picture of a hardened, production-grade system:

- `xdocs/bible.md` — the "complete technical reference"
- `xdocs/not-for-ai/done.md` — the "completed features" checklist

Both were wrong. Not slightly wrong — systematically, dangerously wrong. They described features as implemented that did not exist in the code at all.

---

## The Complete Gap Table

Here is every feature that was documented as "done" or "implemented" but was verified (via grep + file reading) to not exist in the actual TypeScript source:

| Claimed (in docs) | Reality in code |
|-------------------|----------------|
| `back/scripts/db-hardening.ts` with `CHECK (balance >= 0)` database constraint | File did not exist. No DB-level constraint. |
| `lib/decimal.ts` Decimal → number converter | File did not exist. All money was `Float`. |
| `lib/logger.ts` Winston + `financial.log` audit trail | File did not exist. `console.error` everywhere. |
| `userCache` in `auth.middleware.ts` | Not present — every request hit Postgres for `user.findUnique`. |
| `EscrowService` (centralised settlement module) | File did not exist. Payout logic was split across three files. |
| `auction.scheduler.ts` using `node-cron` | Had been replaced by BullMQ. Docs still referenced the old design. |
| `FOR UPDATE` row locks in `placeBid`, `withdraw`, `endAuction` | None. Every transaction was plain `findUnique` then `update`. All race conditions were still present. |
| `Decimal` / `Integer` money type | Still `Float` in the Prisma schema. |
| GIN full-text search index | Not in migrations. |
| Indexes on `Bid(auctionId,status)`, `Notification(userId,isRead)` | Not in migrations. |
| Zod password strength policy | Not present. |
| Sealed-bid privacy (mask `currentPrice`, random order) | `getAuctionBids` used `orderBy: { amount: 'desc' }` and `name: false` (which Prisma ignores). Fully visible. |

---

## How This Happens

This kind of documentation drift has a name in the industry: **aspirational documentation**. It is the habit of writing documentation as if the features are already done, before writing the code.

It happens for understandable reasons:

1. **Planning habit.** You write a detailed plan of what you want to build. The plan looks like documentation. Someone (or you, later) treats the plan as a record of what was built.

2. **Time pressure.** You implement 70% of a feature, mark it done, and intend to finish the remaining 30% "later." The 30% never happens. The documentation still says 100%.

3. **Wishful architecture.** You design a beautiful `EscrowService` in a planning document. You never write the code. The planning document lives in the repo forever, indistinguishable from implemented code.

4. **No verification process.** Nobody checks the documentation against the code. There is no CI step that runs `grep "FOR UPDATE" back/src/**` and fails the build if it finds nothing.

---

## Why It Is Dangerous

In this project, the documentation-reality gap was not just embarrassing — it was actively misleading:

1. **You would present the project to teachers claiming it had row locks.** Teachers who read the docs but did not read the code would believe you. Teachers who DID read the code would find you out. This is the scenario that happened — teachers called it "just CRUD" because they read the code, not the docs.

2. **Future developers (including future Claude sessions) would read the docs and believe them.** The entire plan.md file has a section dedicated to warning future AI sessions: "Trust the code, not the docs." Without this warning, any session reading `bible.md` would think the features existed and would try to build on top of them — building on a phantom foundation.

3. **Security audits become worthless.** A security review that says "the system has `FOR UPDATE` locks" and cites `done.md` as evidence — without checking the code — misses the actual race conditions. The project appeared more secure than it was.

---

## The Audit Methodology

To find the gaps, every claim in the docs was verified with a specific grep or file read:

```bash
# Does EscrowService exist?
grep -r "EscrowService" back/src/
# Result: 0 hits

# Does FOR UPDATE appear in placeBid?
grep -n "FOR UPDATE" back/src/modules/bidding/bid.service.ts
# Result: 0 hits

# Is balance still Float?
grep -n "balance.*Float" back/prisma/schema.prisma
# Result: balance    Float, heldAmount    Float

# Does decimal.ts exist?
ls back/src/lib/decimal.ts
# Result: No such file
```

The audit took a few hours and found 12 major discrepancies. Every one of them represented a real bug or missing feature that needed to be built.

---

## The Lesson: Code Is the Truth

The resolution was to establish a new rule, written into `plan.md` and enforced from that point forward:

> **Trust the code, not the docs.** `bible.md`, `learn.md`, `done.md` are historical / aspirational. Verify with grep/Read before claiming a thing exists.

And:

> **Never write a checkbox into `done.md`.** If a phase task lands, edit plan.md's Phase section to strike it through with `~~text~~` and add the commit hash.

The only authoritative record of what features exist is the TypeScript source and the Prisma schema. Everything else is secondary, potentially stale, and must be verified before being trusted.

---

## The Two Files Were Archived, Not Deleted

`bible.md`, `done.md`, and `back-learn.md` were moved to `xdocs/archive/` with a README explaining:

```markdown
# Archive

These files were part of the original project documentation. They have 
known drift from the actual code — features claimed as implemented that 
do not exist in the TypeScript source. They are preserved for historical 
reference but MUST NOT be trusted as accurate descriptions of the current system.

Trust the code. When in doubt, grep.
```

They were not deleted because they serve as a historical record of the doc-code gap — a record that this book (and plan.md) can reference to tell the story accurately.

---

## What "Done" Actually Means

In this project, from Phase A onward, a task is "done" when:

1. The TypeScript code exists and is committed
2. The Prisma migration exists and is committed (for schema changes)
3. A grep or Read verification confirms the feature exists at the right file/line
4. The plan.md entry for the task is struck through with `~~text~~` and the verification signal is written next to it

Not when:
- The docs say it is done
- You remember writing it
- A test passes (tests can mock the implementation away)

This standard is stricter than most student projects bother with. It is also the standard that prevents a future auditor — or a teacher pulling the repo — from finding a gap between claim and reality.

---

## The Meta-Lesson for Future Projects

If you start a new project and find documentation that sounds confident and detailed, do not trust it at face value. Run:

```bash
# Is this function actually called anywhere?
grep -r "functionName" src/

# Does this file actually exist?
ls src/path/to/claimed/file.ts

# Is this actually in the schema?
grep "fieldName" prisma/schema.prisma
```

Documentation is a communication tool, not a proof. The proof is the code.

---

## Next Chapter

Chapter 24 covers the niche implementation details — the subtle code-level decisions that do not fit anywhere else: the `isDecimalLike` duck-type check, the FNV-1a hash, the `neg()` helper, the `$queryRaw` escape hatch, and more.
