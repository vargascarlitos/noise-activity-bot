# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GitHub "noise activity" bot that simulates realistic human-like repository activity. It runs as a GitHub Actions daily workflow (Mon-Fri only) and uses a multi-layer probabilistic pipeline to generate commits, issues, and pull requests with natural-looking variance.

## Architecture

- **`.github/workflows/bot.yaml`** — GitHub Actions workflow. Runs once daily at 10 AM Paraguay time (14:00 UTC), Monday through Friday. Simply checks out the repo and runs `node scripts/noise.js`. All decision logic lives in the script.

- **`scripts/noise.js`** — Core bot logic (Node.js, no dependencies). Decision pipeline:
  1. **Weekend guard**: hard exit on Sat/Sun (safety check, cron already restricts)
  2. **Vacation week**: ~14% of weeks are skipped entirely (deterministic per week via seeded PRNG)
  3. **Day active check**: ~68% of weekdays produce activity (adjusted by week intensity)
  4. **Contribution count**: Poisson distribution (λ=3.5 × week intensity), clamped to [1, 8]
  5. **Action planning**: distributes count into commits (always), issues (25% chance, max 1), PRs (15% chance, max 1)
  6. **Execution with delays**: 5-30 min random sleep between each action

  Key design: uses a deterministic PRNG (Mulberry32) seeded by date/week so re-runs on the same day produce consistent skip/active decisions. `Math.random()` is used only for non-critical choices (commit messages, delays).

## Key Environment Variables

Configured in `bot.yaml`:
- `GITHUB_TOKEN` / `ACTIONS_PAT` — PAT with contents, issues, and PR write permissions
- `GIT_USER_NAME`, `GIT_USER_EMAIL` — Git author identity

## Running Locally

```bash
# Requires Node.js 20+
export GITHUB_TOKEN="ghp_..."
export GITHUB_REPOSITORY="owner/repo"
export GIT_USER_NAME="YourUser"
export GIT_USER_EMAIL="you@example.com"

node scripts/noise.js
```

No build step, no dependencies beyond Node.js stdlib (`child_process`, `fs`, `path`) and the global `fetch` API (Node 18+).

## Expected Output

- ~500 contributions/year (vs ~13,000 with old bot)
- ~32% of weekdays with zero contributions
- ~7 vacation weeks/year
- 1-8 contributions on active days (mean ~3.5)
- No weekend activity
