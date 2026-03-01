# TASKS.md — clanka-tools
> Last updated: 2026-02-28 | Status: open

## 🔴 High Priority
- [x] **Add tests for `shared/shield.ts`** — 27 tests written and passing (2026-02-26)
- [x] **Add tests for `shared/spine.ts`** — 10 tests written and passing (2026-02-26)
- [ ] **Deploy `workers/clanka-discord`** — verify the worker is actually deployed to Cloudflare and handling Discord interactions. Run `npx wrangler tail` to confirm live traffic or confirm deploy status.
- [x] **Add integration tests for `workers/clanka-discord/src/index.ts` request handling** — coverage added and passing (2026-02-28)
  - Test 405 for non-POST methods, invalid signature handling (`401`), admin-gate rejection, and unknown interaction dispatch behavior.
- [x] **Add hard-fail-safe error handling for GitHub/Supabase request failures in `commandReview` and `commandFeedback`**
  - Ensure `/review` and `/feedback` return stable `DiscordResponse` messages on fetch failures instead of thrown exceptions. (2026-02-28)
  - [x] Added defensive catch-all handling and fallback payload parsing/sanitization in command handlers; updated tests for malformed upstream payloads (2026-02-28).

## 🟡 Medium Priority
- [x] **Add root `package.json`** — done, with vitest workspace config (2026-02-26)
- [x] **`shared/shield.ts` — expand patterns** — added base64, markdown javascript links, encoded null bytes, and SSRF-adjacent target detection with tests (2026-02-28).
- [x] **Add CI workflow** — GitHub Actions CI (lint + test) added and passing (2026-02-26)
- [x] **`shared/` — add index.ts barrel export** — currently consumers import directly from `shield.ts` / `spine.ts`. Add `shared/index.ts` re-exporting both for cleaner consumption.
- [x] **Add regression tests for PR URL validation and command option parsing** (2026-03-01)
  - Added `workers/clanka-discord/commands/registry.test.ts` coverage for `validatePrUrl` valid/non-GitHub/missing-PR cases and command option parsing for `/review`, `/scan`, and unknown command errors.
- [x] **Surface risk summary in `/review` response using existing `riskScore`** (2026-03-01)
  - `commandReview` now computes `riskScore(diffText)`, builds `riskSummary`, and returns it in the response payload with risk details in the Discord message.
- [ ] **Introduce a runtime command schema for `workers/clanka-discord/commands/registry.ts`**
  - Replace the inline `commandRegistry` map with a typed schema carrying name, description, handler, and option definitions so command registration and runtime dispatch share the same source of truth.
- [ ] **Make worker build script cross-platform**
  - Replace `workers/clanka-discord/package.json` `build` script’s macOS-only `sed -i ''` usage with a portable transformation step so Linux CI/dev environments can build reliably.
- [ ] **Add documentation for production env wiring and required tokens/secrets**
  - Create a docs page that explicitly lists `DISCORD_PUBLIC_KEY`, `DISCORD_APPLICATION_ID`, `CLANKA_ADMIN_IDS`, `GITHUB_TOKEN`, `SUPABASE_*`, and local/Cloudflare configuration expectations.

## 🟢 Low Priority / Nice to Have
- [ ] **`workers/clanka-discord` — add command registry** — current Discord handler likely handles one or few slash commands. Add a typed command registry so adding new commands is a one-liner.
- [x] **`shared/spine.ts` — risk scoring** — `riskScore(diff)` added and exported, with tests covering lines changed, files touched, test ratio, src/config weighting, and 0–100 bounds (2026-02-28).
- [ ] **`docs/` — add architecture diagram** — show how `shield.ts` and `spine.ts` are used by the Discord worker and any other consumers.
- [ ] **Add `workers/clanka-discord` tests for command handlers**
  - New `workers/clanka-discord/commands/registry.test.ts` covering `/status`, `/help`, and happy-path `/review`/`/feedback` response formatting with mocked fetch.
- [ ] **Add explicit admin-id sanitization and diagnostics for `CLANKA_ADMIN_IDS`**
  - Trim/deduplicate IDs during parse and return a diagnostic deny message when the allowlist is empty or malformed instead of silently allowing broad access patterns.
- [ ] **Add a lightweight docs/ADR for error handling policy**
  - Document how each command handles malformed input, upstream API failures, and timeout behavior so future contributors extend behavior consistently.

## 🧠 Notes
- No root `package.json` — run commands inside `workers/clanka-discord/`
- `shared/shield.ts`: prompt injection / DoS guard — `triageInput(input): { safe, reason }`
- `shared/spine.ts`: diff structure analysis — `analyzeDiff(diff): DiffInfo`
- `workers/clanka-discord/`: Cloudflare Worker handling Discord interactions
- No `src/` at root level — source lives in `workers/` and `shared/`
- No open GitHub issues
