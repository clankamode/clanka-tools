# TASKS.md — clanka-tools
> Last updated: 2026-03-17 | Status: open

## 🔴 High Priority
- [x] **Add tests for `shared/shield.ts`** — 27 tests written and passing (2026-02-26)
- [x] **Add tests for `shared/spine.ts`** — 10 tests written and passing (2026-02-26)
- [x] **Deploy `workers/clanka-discord`** — verify the worker is actually deployed to Cloudflare and handling Discord interactions. Run `npx wrangler tail` and/or confirm deploy status.
  - Completed: 2026-03-03. Executed `cd workers/clanka-discord && npm run deploy`, which deployed version `a505cde5-afc0-478d-9a7e-9c3a8df1e070` and printed live worker URL `https://clanka-discord.clankamode.workers.dev`.
  - Verification:
    - `npx wrangler deployments list --json` shows latest deployment with version `a505cde5-afc0-478d-9a7e-9c3a8df1e070` at 100% traffic.
    - Production probe: `curl -i https://clanka-discord.clankamode.workers.dev` returned `HTTP/2 405` and `Method not allowed`, confirming the deployed endpoint is live and reachable.
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
- [x] **Introduce a runtime command schema for `workers/clanka-discord/commands/registry.ts`** (2026-03-01)
  - Added typed runtime command schema entries with `name`, `description`, `handler`, and option definitions; runtime dispatch now resolves commands via schema lookup helpers.
- [x] **Make worker build script cross-platform** (2026-03-01)
  - Replaced macOS-specific shell script build flow with `workers/clanka-discord/scripts/build.mjs` and updated the package build script to use Node-based file copy/rewrite logic.
- [x] **Add documentation for production env wiring and required tokens/secrets** (2026-03-01)
  - Added `workers/clanka-discord/README.md` with required production secrets/vars, Cloudflare wiring, and local/deploy command flow.
- [x] **Add shared `healthz` protocol for tool status endpoints** (2026-03-17)
  - Added `shared/healthz.ts` with `createHealthCheck()` for standard version, uptime, timestamp, and dependency status reporting.
  - Added Vitest coverage for no-dependency, degraded/down propagation, rejected dependency checks, and uptime progression.

## 🟢 Low Priority / Nice to Have
- [x] **`workers/clanka-discord` — add command registry** — typed runtime command schema and name-based lookup helpers added for dispatch/metadata reuse (2026-03-01).
- [x] **`shared/spine.ts` — risk scoring** — `riskScore(diff)` added and exported, with tests covering lines changed, files touched, test ratio, src/config weighting, and 0–100 bounds (2026-02-28).
- [x] **`docs/` — add architecture diagram** (2026-03-01)
  - Added `docs/architecture.md` with ASCII diagrams showing `shield.ts` and `spine.ts` flow through the Discord worker and shared consumers.
- [x] **Add `workers/clanka-discord` tests for command handlers** (2026-03-01)
  - Added `workers/clanka-discord/commands/handlers.test.ts` covering `/status`, `/help`, `/review`, and `/feedback` with mocked Discord interaction objects and mocked fetch responses.
- [x] **Add explicit admin-id sanitization and diagnostics for `CLANKA_ADMIN_IDS`** — 2026-03-02
  - Added trimmed, deduplicated parsing for `CLANKA_ADMIN_IDS` and now denylist diagnostics when parsed allowlist is empty or malformed.
- [x] **Add a lightweight docs/ADR for error handling policy** — done (2026-03-03)
  - Added `docs/adr/error-handling-policy.md` documenting command-level malformed input checks, upstream failure responses, and timeout behavior expectations.

## 🧠 Notes
- Root `package.json` exists and runs workspace build/test commands
- `shared/shield.ts`: prompt injection / DoS guard — `triageInput(input): { safe, reason }`
- `shared/spine.ts`: diff structure analysis — `analyzeDiff(diff): DiffInfo`
- `workers/clanka-discord/`: Cloudflare Worker handling Discord interactions
- No `src/` at root level — source lives in `workers/` and `shared/`
- GitHub issue #15 tracks the shared tool health check protocol and is implemented on `feat/tool-health-check-protocol`
