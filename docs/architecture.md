# Clanka Tools Architecture

This repository has two core shared modules:

- `shared/shield.ts` for inbound input triage (`triageInput`)
- `shared/spine.ts` for diff structure + risk analysis (`analyzeDiff`, `riskScore`)

`workers/clanka-discord` uses both modules in the `/review` command handler to block unsafe input before fetches and to summarize PR diffs after fetches.

## Runtime Flow (Discord Worker)

```text
Discord Slash Command
        |
        v
+----------------------------------+
| workers/clanka-discord/src/index |
| - verify Discord signature       |
| - admin gate                     |
| - route command via registry     |
+----------------------------------+
        |
        v
+--------------------------------------+
| workers/clanka-discord/commands/*    |
| commandRegistry.review                |
+--------------------------------------+
        |                        |
        | 1) triage PR URL       | 2) analyze PR diff
        v                        v
+----------------------+   +----------------------+
| shared/shield.ts     |   | shared/spine.ts      |
| triageInput(pr_url)  |   | analyzeDiff(diff)    |
| blocks risky input   |   | riskScore(diff)      |
+----------------------+   +----------------------+
        |                        |
        +-----------+------------+
                    |
                    v
        DiscordResponse JSON payload
```

## Shared Consumer Model

The shared modules are not worker-specific and can be consumed by any package in this repo through direct imports or the shared barrel export (`shared/index.ts`).

```text
+------------------+      +----------------------+
| Consumer A       |      | Consumer B           |
| Discord Worker   |      | Future CLI/Worker    |
+--------+---------+      +----------+-----------+
         |                           |
         +-------------+-------------+
                       |
                       v
               +---------------+
               | shared/index  |
               | re-exports:   |
               | - triageInput |
               | - analyzeDiff |
               | - riskScore   |
               +---------------+
```

## Current Coupling Rules

- `triageInput()` is a pre-network guard in `/review`.
- `analyzeDiff()` and `riskScore()` are post-fetch diff analyzers in `/review`.
- Worker request validation and admin authorization stay in `src/index.ts`; command logic stays in `commands/registry.ts`.
