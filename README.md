# clanka-tools

`clanka-tools` is a utility repo for shared guardrail logic and worker-level integrations around the Clanka automation surface. It currently includes Discord- and review-facing Worker packages plus reusable parsing/triage modules used to keep inbound inputs and diff analysis deterministic.

## Stack
- TypeScript
- Cloudflare Workers (`workers/clanka-discord`, `workers/clanka-reviewer`)
- Discord interactions (`discord-interactions`)
- Vitest (root workspace test runner)

## Repo Layout
- `shared/shield.ts` - prompt/input triage (`triageInput`, `SHIELD_PATTERNS`)
- `shared/spine.ts` - diff structure analysis (`analyzeDiff`, `riskScore`)
- `shared/healthz.ts` - shared health-check protocol (`createHealthCheck`)
- `workers/clanka-discord/` - Discord interactions worker + wrangler config + deploy scripts
- `workers/clanka-reviewer/` - heuristic review HTTP worker
- `scripts/` - operator utilities (`dep-graph`, `ai-backlog-worker`)
- `docs/` - runbook, architecture notes, and ADRs
- `docs/adr/error-handling-policy.md` - command error-handling policy (malformed input, upstream failures, timeout policy)

## Run And Deploy
Root `package.json` owns shared tests and convenience scripts. Worker install/build still runs inside the worker package when needed.

```bash
npm install
npm test
npm run dep-graph
```

Discord worker local loop:
```bash
cd workers/clanka-discord
npm install
npm run build
npx wrangler dev
```

Deploy Discord worker:
```bash
cd workers/clanka-discord
npm run deploy
```

Register Discord command wiring (if needed):
```bash
cd workers/clanka-discord
npm run register
```

## Key Exports
- `triageInput(input: string)` from `shared/shield.ts`
- `analyzeDiff(diffText: string)` / `riskScore(diffText: string)` from `shared/spine.ts`
- `createHealthCheck(opts)` from `shared/healthz.ts`
