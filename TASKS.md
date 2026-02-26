# TASKS.md — clanka-tools
> Last updated: 2026-02-25 | Status: open

## 🔴 High Priority
- [x] **Add tests for `shared/shield.ts`** — 27 tests written and passing (2026-02-26)
- [x] **Add tests for `shared/spine.ts`** — 10 tests written and passing (2026-02-26)
- [ ] **Deploy `workers/clanka-discord`** — verify the worker is actually deployed to Cloudflare and handling Discord interactions. Run `npx wrangler tail` to confirm live traffic or confirm deploy status.

## 🟡 Medium Priority
- [x] **Add root `package.json`** — done, with vitest workspace config (2026-02-26)
- [ ] **`shared/shield.ts` — expand patterns** — add patterns for: base64-encoded injections, markdown link exploits (`[click me](javascript:...)`), null bytes, SSRF-adjacent patterns (`file://`, `localhost`, `169.254.`).
- [x] **Add CI workflow** — GitHub Actions CI (lint + test) added and passing (2026-02-26)
- [ ] **`shared/` — add index.ts barrel export** — currently consumers import directly from `shield.ts` / `spine.ts`. Add `shared/index.ts` re-exporting both for cleaner consumption.

## 🟢 Low Priority / Nice to Have
- [ ] **`workers/clanka-discord` — add command registry** — current Discord handler likely handles one or few slash commands. Add a typed command registry so adding new commands is a one-liner.
- [ ] **`shared/spine.ts` — risk scoring** — `analyzeDiff` currently returns structural info. Add a `riskScore(diff)` fn that returns 0–100 based on: lines changed, files touched, test ratio, whether src vs config files.
- [ ] **`docs/` — add architecture diagram** — show how `shield.ts` and `spine.ts` are used by the Discord worker and any other consumers.

## 🧠 Notes
- No root `package.json` — run commands inside `workers/clanka-discord/`
- `shared/shield.ts`: prompt injection / DoS guard — `triageInput(input): { safe, reason }`
- `shared/spine.ts`: diff structure analysis — `analyzeDiff(diff): DiffInfo`
- `workers/clanka-discord/`: Cloudflare Worker handling Discord interactions
- No `src/` at root level — source lives in `workers/` and `shared/`
- No open GitHub issues
