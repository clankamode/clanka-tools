## 🧠 Coding Principles (all agents)

Derived from [Karpathy's LLM pitfalls](https://x.com/karpathy/status/2015883857489522876). Bias toward caution over speed; use judgment on trivial tasks.

### 1. Think Before Coding
- State assumptions explicitly. If uncertain, **ask** — don't guess and run.
- If multiple interpretations exist, present them. Don't pick silently.
- Push back when a simpler approach exists. Stop when confused.

### 2. Simplicity First
- No features beyond what was asked. No speculative abstractions.
- No "flexibility" or "configurability" that wasn't requested.
- If 200 lines could be 50, rewrite it.
- Test: "Would a senior engineer call this overcomplicated?" If yes, simplify.

### 3. Surgical Changes
- Touch only what the task requires. Don't "improve" adjacent code/comments/formatting.
- Match existing style, even if you'd do it differently.
- Remove imports/variables YOUR changes orphaned. Leave pre-existing dead code alone (mention it, don't delete).
- Every changed line should trace directly to the request.

### 4. Goal-Driven Execution
- Transform tasks into verifiable goals with success criteria.
- For multi-step work, state a brief plan with verify steps.
- Strong success criteria → independent looping. Weak criteria → ask first.

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
