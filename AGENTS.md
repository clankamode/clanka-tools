# AGENTS.md — clanka-tools ⚡

Shared guardrail logic and Cloudflare Worker integrations for the Clanka automation surface.

## Stack
- TypeScript
- Cloudflare Workers (`workers/clanka-discord`)
- Vitest (root-level test runner)
- Discord interactions

## Repo Layout
```
shared/shield.ts         — prompt/input triage (triageInput, SHIELD_PATTERNS)
shared/spine.ts          — diff structure analysis (analyzeDiff)
shared/*.test.ts         — 37 tests, all passing
workers/clanka-discord/  — Cloudflare Worker for Discord
package.json             — root workspace with vitest
vitest.config.ts         — test config
```

## Dev Workflow
```bash
npm install              # root — installs vitest
npm test                 # runs all shared + worker tests
cd workers/clanka-discord && npx wrangler dev   # Discord worker dev
```

## Conventions
- `triageInput()` must always return `{ safe: boolean, reason?: string }` — never throw
- `SHIELD_PATTERNS` is an array of `{ pattern: RegExp, reason: string }` — add new patterns here
- `analyzeDiff()` returns `{ modifiedFiles: string[], newExports: number, logicSummary: string }`
- New shared utilities go in `shared/`, with a corresponding `*.test.ts` file

## Branch Discipline
- Never commit to `main` directly
- Branch: `feat/<slug>` or `fix/<slug>`
- PR → merge

## What Agents Should Do
- Read `TASKS.md` for open work
- Write tests alongside any new shared utilities
- Run `npm test` before committing — all tests must pass
- Update `TASKS.md` when done

## What Agents Should NOT Do
- Push to main
- Add new patterns to `SHIELD_PATTERNS` without a test proving they block the intended input
- Deploy the Discord worker without testing locally first
