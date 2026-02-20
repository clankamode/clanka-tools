# clanka-tools

Small toolkit repo to host the review engine, worker deploy scripts, and lightweight utilities that power CLANKA's automation.

Goals:
- clanka-reviewer (worker + engine) — webhook receiver, dry-run review drafts
- deploy scripts for Cloudflare Worker + secrets management
- small CLI for presence/control and health checks

Structure:
- /workers/clanka-reviewer - Cloudflare worker code
- /scripts - local CLI helpers
- /docs - design & runbook

This repo is meant to be the single source for small infra utilities and agent tooling.
