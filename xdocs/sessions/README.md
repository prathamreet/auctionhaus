# Session Logs — Protocol

This folder is the **scratchpad / memory** that lets Claude pick up across sessions without re-discovering everything from scratch each time. `plan.md` is the long-lived strategy; this folder is the short-lived working memory.

## Files in this folder

- `README.md` — this file, the protocol.
- `INDEX.md` — one-line entry per session, newest on top. Read this first to see what happened recently.
- `_TEMPLATE.md` — copy this when starting a new session. Do not edit `_TEMPLATE.md` itself.
- `YYYY-MM-DD-<slug>.md` — one file per session. Slug is a 2-4 word kebab-case label.

## Rules for Claude

### At session START

1. Read in order:
   - `/plan.md` (strategy / SSOT).
   - `xdocs/sessions/INDEX.md` (recent activity).
   - The **most recent** session log linked from INDEX.md (what was being worked on last).
2. If user opens with "continue" / "carry on" / similar, the previous session's `## Next Up` block is the brief.
3. If user gives a fresh task, scan INDEX.md for the last 2-3 sessions to check for related context, then proceed.

### DURING the session

1. Copy `_TEMPLATE.md` to a new file `YYYY-MM-DD-<slug>.md` (use today's date from the CLAUDE.md `currentDate` reminder).
2. Add a one-line entry to the **top** of `INDEX.md` linking the new file with date and one-sentence summary.
3. Fill out the `## Goal` and `## Context Loaded` sections before starting work.
4. As you do work, append to the running `## Log` section. Bullet points are fine. Don't over-format.
5. If you discover something that updates the long-lived plan, edit `/plan.md` directly (strikethrough completed items, add new ones) — the session log just notes that the edit happened.

### At session END (or before user goes idle)

1. Fill `## What Landed` with concrete artefacts (files touched, commit hashes if any, key decisions).
2. Fill `## Open Questions` with anything blocking that the user needs to answer.
3. Fill `## Next Up` with the single concrete next action — written so a fresh Claude session can act on it without further context.
4. Move the session's one-line in INDEX.md from "in progress" to "complete" if applicable.

### What NOT to do

- Do not write a new "done.md" or any other parallel checklist. Strikethrough in `plan.md`.
- Do not duplicate `plan.md` content here. Session logs are *deltas*: what was tried, what was learned, what's pending.
- Do not edit `_TEMPLATE.md`. It is a copy source.
- Do not delete old session logs even if they feel stale — they are the audit trail. If `INDEX.md` gets crowded (>30 entries), collapse older entries into a `## Archive` heading at the bottom of INDEX.md but keep the files.

### Filename convention

- `2026-05-28-audit-and-plan.md` — date first (sorts naturally), then 2-4 word slug.
- Slug uses kebab-case, no emojis, no underscores.
- Example slugs: `phase-a1-decimal-money`, `bid-lock-implementation`, `fraud-graph-bootstrap`, `ui-button-extraction`.

This protocol is enforced by `CLAUDE.md` (project rules) which lists this folder in the read-on-start sequence.
