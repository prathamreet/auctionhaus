## Read order at session start (strict)

1. `/plan.md` — single source of truth for strategy, phases, and rules for future sessions.
2. `xdocs/sessions/INDEX.md` — what happened recently, newest on top.
3. The most recent session log linked from INDEX.md — what was being worked on last and what's queued under "Next Up".
4. `graphify-out/GRAPH_REPORT.md` — knowledge graph map of the codebase. Then optionally `graphify-out/wiki/index.md`.
5. Only after the above, touch source files.

Do not trust anything under `xdocs/archive/` — it is preserved AI-generated material with known drift. The archive's own README explains why.

## Session memory protocol

Every session creates a log under `xdocs/sessions/YYYY-MM-DD-<slug>.md`. The full protocol — when to create the file, what sections to fill, how to update INDEX.md — lives in `xdocs/sessions/README.md`. Read it once at the start of any session that will edit code.

Do NOT write a parallel "done.md" or any other checklist. Progress = strikethrough in `/plan.md` + a session log entry.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Hard rules (from the user, do not violate)

- Do not run `npm run dev`, `next build`, `jest`, `prisma migrate dev`, or any process that boots the app. Analyse + plan only. The user runs execution themselves.
- No emojis in code. No AI-template UI vibes. CSS variables + clean typography only.
- Do not touch git commands unless the user explicitly asks.
