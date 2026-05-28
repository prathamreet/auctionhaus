# Session Index

> Newest on top. One line per session. Click into the file for full notes.

## In Progress

_(none — last session closed)_

## Completed

- **2026-05-28** — [Audit & Plan](2026-05-28-audit-and-plan.md) — Deep audit of monorepo, identified doc/code drift, wrote `plan.md` as SSOT, archived AI-generated docs into `xdocs/archive/`, set up this sessions/ folder. Then **Phase A4 fully closed**: sealed-bid privacy fixed across REST (`bid.service`, `auction.service`), socket emit (`bid.controller`), and source (`placeBid` no longer updates `currentPrice` for sealed). Frontend `Bid` type widened. Tests added in both service test files. Then **Phase A2 fully closed**: `FOR UPDATE` pessimistic locks landed in placeBid / withdraw / buyNow / endAuction / confirmWinnerPayment under a global lock-order (auction first, then wallets ASC). Withdraw and buyNow check-then-act races eliminated. endAuction idempotent under BullMQ re-delivery. Global jest mock defaults added so existing tests pass through transparently. Bonus: `setAutoBid` now rejects sealed auctions (was a Phase A6 follow-up identified earlier). Tiny housekeeping fix in `back/README.md`.

## Archive

_(empty — collapse older entries here once INDEX.md grows past ~30 lines)_
