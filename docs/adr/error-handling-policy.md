# ADR-0001: Error Handling Policy for Discord Commands

Status: accepted
Date: 2026-03-03

## Context

The Discord worker executes commands through a small registry and must fail safely under user error or upstream instability. Command handlers currently include shield and URL validation, plus defensive parsing and fetch error handling.

## Decision

1. Separate malformed input from runtime failures.
2. Map recoverable upstream failures to a deterministic user-facing message.
3. Keep timeout handling explicit at the command level as a known gap.

## Policy

### 1) Malformed input

- Parse command input in command handlers before calling external services.
- Return command-specific, non-error Discord payloads (HTTP `200` in current request flow) for invalid `/review` and `/feedback` arguments.

Current behaviors:

- `/review`
  - Missing or non-string `pr_url`: `Missing or invalid \`pr_url\` argument.`
  - Shield/guard rejection: `⚠️ **Shield Alert:** <reason>`
  - Invalid PR URL forms:
    - `Invalid URL format.`
    - `Only GitHub pull request URLs are supported.`
    - `Missing pull request number in URL.`
    - `Invalid GitHub PR URL.`

- `/feedback`
  - Invalid/empty `limit` input is normalized to `5` in code and does not surface a user-facing argument error.

- Worker-level parsing issues
  - Malformed request JSON falls back to the outer `try/catch` in `index.ts` and returns:
    - `❌ **System Error:** Internal failure during processing.`

### 2) Upstream API failures

Rules:

- Never throw raw fetch/network/parser errors from handlers.
- Return a stable downtime-style message and keep command response shape consistent.
- Prefer explicit service-scoped messaging so downstream users know whether the dependency was GitHub or Supabase.

Current mapping:

- `/review`
  - GitHub PR metadata fetch rejection, non-OK response, JSON parse failure, or diff read failure returns:
    - `⚠️ **PR Review service is temporarily unavailable.** Please try again shortly.`

- `/feedback`
  - Supabase fetch rejection, non-OK response, or JSON parse failure returns:
    - `⚠️ **Feedback service is temporarily unavailable.** Please try again shortly.`

### 3) Timeout behavior

- There is currently no command-specific timeout wrapper (`AbortController`/`setTimeout`) in `registry.ts`.
- Timeouts are therefore governed by the runtime environment and upstream APIs’ behavior.
- ADR outcome: this is accepted as-is for now, and any future reliability work should introduce
  - explicit per-upstream time budget.
  - a timeout branch that returns the same service-unavailable pattern used for other upstream failures.

## Consequences

- Contributors should preserve the current stable failure contracts (`serviceUnavailable` content messages and argument validation returns).
- Changes that add new upstream dependencies for an existing command should reuse the same pattern.
- Any new command touching network IO should implement the same three-step classification:
  1. validate/sanitize input,
  2. handle external failures with a stable user-facing response,
  3. choose whether to keep relying on runtime timeouts or introduce command-level timeout guards.
