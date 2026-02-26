# TASKS.md — clanka-tools
> Last updated: 2026-02-25 | Status: open

## 🔴 High Priority
- [ ] **Add tests for `shared/shield.ts`** — `triageInput` and `SHIELD_PATTERNS` have no test file. Write tests for: each pattern match (prompt injection, XSS, data URLs), input >2000 chars, safe inputs that shouldn't be flagged, edge cases (mixed case, unicode).
- [ ] **Add tests for `shared/spine.ts`** — `analyzeDiff` has no test coverage. Test: added-only diff, removed-only, mixed, empty diff, large diff, binary file markers.
- [ ] **Deploy `workers/clanka-discord`** — verify the worker is actually deployed to Cloudflare and handling Discord interactions. Run `npx wrangler tail` to confirm live traffic or confirm deploy status.

## 🟡 Medium Priority
- [ ] **Add root `package.json`** — repo has no root package.json, making it awkward to run scripts or install shared deps. Add root workspace config pointing to `workers/clanka-discord` and `shared/`.
- [ ] **`shared/shield.ts` — expand patterns** — add patterns for: base64-encoded injections, markdown link exploits (`[click me](javascript:...)`), null bytes, SSRF-adjacent patterns (`file://`, `localhost`, `169.254.`).
- [ ] **Add CI workflow** — no `.github/workflows/` in this repo. Add lint + build + test (once tests exist).
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
