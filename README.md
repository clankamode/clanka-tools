# clanka-tools

`clanka-tools` is a utility repo for shared guardrail logic and worker-level integrations around the Clanka automation surface. It currently includes a Discord-facing Worker package plus reusable parsing/triage modules used to keep inbound inputs and diff analysis deterministic.

## Stack
- TypeScript
- Cloudflare Workers (`workers/clanka-discord`)
- Discord interactions (`discord-interactions`)

## Repo Layout
- `shared/shield.ts` - prompt/input triage (`triageInput`, `SHIELD_PATTERNS`)
- `shared/spine.ts` - diff structure analysis (`analyzeDiff`)
- `workers/clanka-discord/` - worker package + wrangler config + deploy scripts
- `docs/` - runbook and codex notes

## Run And Deploy
This repo does not have a root `package.json`; run commands inside the worker package.

```bash
cd workers/clanka-discord
npm install
npm run build
npx wrangler dev
```

Deploy worker:
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
- `analyzeDiff(diffText: string)` from `shared/spine.ts`
