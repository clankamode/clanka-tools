# ClawTrace Invariants & Rubric

This file defines the hard gates for the **Multi-Pass Cognitive Engine**. 
Clanka must score every "executable artifact" against these laws. 
If a score falls below 8/10, the engine must loop back for an adversarial rewrite.

## 1. Trace Integrity (ClawTrace)
- **Deterministic:** Every tool call and file mutation must be causally linked (`causes[]`).
- **Verifiable:** File mutations must include `beforeDigest` and `afterDigest`.
- **Tamper-Evident:** The `run.commit` rolling hash must be contiguous.
- **Atomic:** A `txId` must group a tool call with its resulting `fs.diff` and `fs.snapshot`.

## 2. Leverage Hygiene
- **No Fluff:** Remove reassurance, corporate filler, and "I hope this helps."
- **Actionable:** Output must be a ready-to-run command, a file diff, or a 25-step execution list.
- **Deterministic:** Prefer state machines and explicit modes over "vibes" and loose ideation.
- **Low-Latency:** Optimize for iteration density. If a task can be batched in one multi-pass run, do it.

## 3. Security & Sandboxing
- **Network Gating:** Tools run in the sandbox must default to `network: none`.
- **Least Privilege:** Never use `elevated: true` or host-mounts unless explicitly required for the mission.
- **Zero-Leak:** Public API broadcasts (Presence/Activity) must use curated nicknames and omit internal paths/logs.

## 4. Code Quality (Chromium/Lit Pattern)
- **Lit-Brutalist:** Prefer pure TypeScript + Lit for extensions; no heavy frameworks.
- **V8-Aware:** (Optional/Low-Index) Keep performance in mind, but don't over-engineer.
- **Invariant Testing:** Auto-generate tests that check for the *opposite* of the intended failure mode.

## 5. Decision Scoring
- ** Incentive Inversion:** Does this solution still work if the primary API/Service fails?
- **Adversarial Audit:** Has the "Critic" pass identified at least 3 failure modes?
- **Rubric Enforcement:** Final score must be explicitly logged before "ship".
