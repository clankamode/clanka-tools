#!/usr/bin/env node
/**
 * AI Backlog Worker
 *
 * Nightly job: pick one open GitHub issue labeled `ai-pickup-eligible`,
 * spawn a Claude/DeepSeek agent on it in a fresh worktree, open a PR
 * marked `needs-review`. Discord-ping massa when done (success or fail).
 *
 * Filed as issue #671 in clankamode/exterior-crm.
 *
 * Hard bounds:
 *   - Max 1 PR per night per repo (file lock at /tmp/ai-backlog-<repo>.lock)
 *   - 30 min wall clock per agent attempt
 *   - Never enables auto-merge
 *   - Issue must NOT have label `customer-impacting`, `secrets`, or `do-not-ai`
 *   - On failure: add label `ai-pickup-failed` with 7d cooldown via comment timestamp
 *
 * Usage:
 *   AI_BACKLOG_REPO=clankamode/exterior-crm \
 *   DISCORD_WEBHOOK_URL=... \
 *   GITHUB_TOKEN=... \
 *   DEEPSEEK_API_KEY=... \
 *   node ai-backlog-worker.mjs
 *
 *   --dry-run          Pick + log but don't spawn agent or open PR
 *   --repo owner/name  Override AI_BACKLOG_REPO (also --repo=owner/name)
 *   --max-issues N     Only N=1 is accepted (hard bound: at most 1 issue per run)
 *   --help             Show this help
 */

import { execSync, spawnSync } from "node:child_process";
import { existsSync, writeFileSync, mkdirSync, readFileSync, unlinkSync, statSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const MAX_ISSUES_HARD_BOUND = 1;
const DEFAULT_REPO = "clankamode/exterior-crm";

const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL;
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const COOLDOWN_DAYS = 7;
const MAX_WALL_CLOCK_MS = 30 * 60 * 1000;

const TODAY = new Date().toISOString().slice(0, 10);
const LOG_DIR = join(homedir(), ".cache", "ai-backlog-worker");
mkdirSync(LOG_DIR, { recursive: true });
const LOG_PATH = join(LOG_DIR, `${TODAY}.log`);

export function usageText() {
  return [
    "Usage: node ai-backlog-worker.mjs [--dry-run] [--repo owner/name] [--max-issues 1] [--help]",
    "",
    "  --dry-run          Pick + log but don't spawn agent or open PR",
    "  --repo owner/name  Override AI_BACKLOG_REPO (also --repo=owner/name)",
    "  --max-issues N     Only N=1 is accepted (hard bound: at most 1 issue per run)",
    "  --help             Show this help",
  ].join("\n");
}

/**
 * @param {string[]} argv
 * @param {number} index
 * @param {string} name
 * @returns {{ error: string } | { value: string, nextIndex: number }}
 */
function takeFlagValue(argv, index, name) {
  const arg = argv[index];
  const prefix = `${name}=`;
  if (arg.startsWith(prefix)) {
    const value = arg.slice(prefix.length);
    if (!value) {
      return { error: `${name} requires a value` };
    }
    return { value, nextIndex: index };
  }
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("-")) {
    return { error: `${name} requires a value` };
  }
  return { value, nextIndex: index + 1 };
}

/**
 * @param {string[]} [argv]
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ ok: true, help: true } | { ok: true, help: false, dryRun: boolean, maxIssues: number, repo: string } | { ok: false, error: string }}
 */
export function parseCliArgs(argv = [], env = process.env) {
  if (argv.includes("--help") || argv.includes("-h")) {
    return { ok: true, help: true };
  }

  let dryRun = false;
  let maxIssues = MAX_ISSUES_HARD_BOUND;
  let repo =
    (typeof env.AI_BACKLOG_REPO === "string" && env.AI_BACKLOG_REPO.trim()) ||
    DEFAULT_REPO;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--max-issues" || arg.startsWith("--max-issues=")) {
      const taken = takeFlagValue(argv, i, "--max-issues");
      if ("error" in taken) {
        return { ok: false, error: taken.error };
      }
      i = taken.nextIndex;
      const parsed = Number(taken.value);
      if (!Number.isInteger(parsed) || parsed < 1) {
        return {
          ok: false,
          error: `--max-issues must be a positive integer (got ${taken.value})`,
        };
      }
      if (parsed !== MAX_ISSUES_HARD_BOUND) {
        return {
          ok: false,
          error: `--max-issues=${parsed} is not supported; this worker processes at most ${MAX_ISSUES_HARD_BOUND} issue per run.`,
        };
      }
      maxIssues = parsed;
      continue;
    }
    if (arg === "--repo" || arg.startsWith("--repo=")) {
      const taken = takeFlagValue(argv, i, "--repo");
      if ("error" in taken) {
        return { ok: false, error: taken.error };
      }
      i = taken.nextIndex;
      if (!/^[^/\s]+\/[^/\s]+$/.test(taken.value)) {
        return {
          ok: false,
          error: `--repo must be owner/name (got ${taken.value})`,
        };
      }
      repo = taken.value;
      continue;
    }
    if (arg.startsWith("-")) {
      return {
        ok: false,
        error: `Unknown flag: ${arg}. ${usageText().split("\n")[0]}`,
      };
    }
    return { ok: false, error: `Unexpected argument: ${arg}` };
  }

  return { ok: true, help: false, dryRun, maxIssues, repo };
}

/**
 * @param {{ prUrl: string | null, dryRun: boolean, hadIssue: boolean }} outcome
 * @returns {0 | 1}
 */
export function exitCodeAfterAttempt(outcome) {
  if (outcome.dryRun || !outcome.hadIssue) {
    return 0;
  }
  return outcome.prUrl ? 0 : 1;
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    writeFileSync(LOG_PATH, line + "\n", { flag: "a" });
  } catch {}
}

function sh(cmd, opts = {}) {
  return execSync(cmd, { encoding: "utf8", ...opts }).trim();
}

async function discord(content, embed) {
  if (!DISCORD_WEBHOOK) {
    log(`(no DISCORD_WEBHOOK_URL set) would send: ${content}`);
    return;
  }
  const body = { content };
  if (embed) body.embeds = [embed];
  try {
    const res = await fetch(DISCORD_WEBHOOK, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) log(`discord post failed: ${res.status} ${await res.text()}`);
  } catch (e) {
    log(`discord exception: ${e.message}`);
  }
}

// ─── lock ──────────────────────────────────────────────────────────────────
function acquireLock(lockFile) {
  if (existsSync(lockFile)) {
    const age = Date.now() - statSync(lockFile).mtimeMs;
    // stale > 24h → reclaim
    if (age < 24 * 60 * 60 * 1000) {
      const owner = readFileSync(lockFile, "utf8");
      throw new Error(`lock held: ${owner} (age ${Math.round(age / 1000 / 60)}min)`);
    }
    log(`reclaiming stale lock (${Math.round(age / 1000 / 60)}min old)`);
  }
  writeFileSync(lockFile, `${process.pid} ${new Date().toISOString()}`);
}
function releaseLock(lockFile) {
  if (!lockFile) return;
  try { unlinkSync(lockFile); } catch {}
}

// ─── issue selection ──────────────────────────────────────────────────────
function pickIssue(repo, maxIssues) {
  const raw = sh(
    `gh issue list --repo ${repo} ` +
      `--label ai-pickup-eligible ` +
      `--state open ` +
      `--limit 50 ` +
      `--json number,title,body,labels,createdAt,comments`,
  );
  const issues = JSON.parse(raw);
  const eligible = issues.filter((i) => {
    const labels = i.labels.map((l) => l.name);
    if (labels.includes("customer-impacting")) return false;
    if (labels.includes("secrets")) return false;
    if (labels.includes("do-not-ai")) return false;
    if (labels.includes("needs-discussion")) return false;
    // cooldown: if labeled ai-pickup-failed, skip for COOLDOWN_DAYS
    if (labels.includes("ai-pickup-failed")) {
      const lastComment = i.comments?.slice(-1)[0];
      if (lastComment) {
        const ageDays =
          (Date.now() - new Date(lastComment.createdAt).getTime()) /
          (1000 * 60 * 60 * 24);
        if (ageDays < COOLDOWN_DAYS) return false;
      }
    }
    return true;
  });
  // sort: shortest body first (smaller scope) then oldest
  eligible.sort((a, b) => {
    const aLen = (a.body || "").length;
    const bLen = (b.body || "").length;
    if (aLen !== bLen) return aLen - bLen;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
  return eligible.slice(0, maxIssues)[0] || null;
}

// ─── agent prompt ─────────────────────────────────────────────────────────
function buildPrompt(issue, branch, worktree, repo) {
  return `CONTEXT
You are an autonomous backlog worker. You have been spawned to attempt issue #${issue.number} from ${repo}.

REPO: ${repo}
BRANCH: ${branch} (already created off origin/main)
WORKTREE: ${worktree}

ISSUE #${issue.number}: ${issue.title}

${issue.body}

═══════════════════════════════════════════════════════════════
WORKFLOW
═══════════════════════════════════════════════════════════════
1. Read the issue + relevant code. If acceptance criteria are unclear or scope is too large, ABORT by writing "ABORT: <reason>" to /tmp/agent-abort and exit. Do not open a PR.
2. Implement minimum-scope fix matching the issue's stated acceptance criteria.
3. Run \`npm test\` (or repo's test command) — MUST be green pre-commit.
4. Conventional commits.
5. Push branch and open a PR via gh:
   gh pr create --base main --head ${branch} --title "fix: <short title> (#${issue.number})" --body "..." --label needs-review --label ai-authored
6. PR body must include: "Closes #${issue.number}", what you changed, why, test counts, any deferred TODOs.
7. DO NOT enable auto-merge.
8. DO NOT push to main.

CONSTRAINTS
- Surgical changes only. No drive-by refactors.
- No new dependencies.
- No PII / secrets in commits or PR body.
- Match existing code style.
- If you discover the issue is actually customer-impacting or touches Twilio/Stripe/outbound SMS, ABORT.

DELIVERABLE
PR URL and one-line summary, written to /tmp/agent-result.
`;
}

// ─── agent spawn ──────────────────────────────────────────────────────────
function spawnAgent(prompt, worktree, deadline) {
  const promptPath = join(tmpdir(), `ai-backlog-prompt-${process.pid}.txt`);
  writeFileSync(promptPath, prompt);

  log(`spawning claude agent (deadline ${new Date(deadline).toISOString()})`);

  const remainingMs = deadline - Date.now();
  if (remainingMs < 60_000) throw new Error("less than 1min left, refusing to spawn");

  const env = {
    ...process.env,
    ANTHROPIC_BASE_URL: "https://api.deepseek.com/anthropic",
    ANTHROPIC_MODEL: "deepseek-v4-pro[1m]",
    ANTHROPIC_DEFAULT_OPUS_MODEL: "deepseek-v4-pro[1m]",
    ANTHROPIC_DEFAULT_SONNET_MODEL: "deepseek-v4-pro[1m]",
    ANTHROPIC_DEFAULT_HAIKU_MODEL: "deepseek-v4-flash",
    ANTHROPIC_SMALL_FAST_MODEL: "deepseek-v4-flash",
    ANTHROPIC_AUTH_TOKEN: DEEPSEEK_KEY || "",
    DEEPSEEK_API_KEY: DEEPSEEK_KEY || "",
  };

  const res = spawnSync(
    "claude",
    [
      "--print",
      "--dangerously-skip-permissions",
      "--max-turns",
      "80",
      "-p",
      prompt,
    ],
    {
      cwd: worktree,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: remainingMs,
      encoding: "utf8",
    },
  );

  return {
    code: res.status,
    stdout: res.stdout || "",
    stderr: res.stderr || "",
    timedOut: res.signal === "SIGTERM",
  };
}

// ─── main ─────────────────────────────────────────────────────────────────
async function main() {
  const parsed = parseCliArgs(process.argv.slice(2));
  if (!parsed.ok) {
    log(parsed.error);
    process.exitCode = 1;
    return;
  }
  if (parsed.help) {
    console.log(usageText());
    return;
  }

  const { dryRun, repo, maxIssues } = parsed;
  const lockFile = `/tmp/ai-backlog-${repo.replace("/", "-")}.lock`;
  let exitCode = 0;

  log(
    `AI Backlog Worker starting (repo=${repo}, dryRun=${dryRun}, maxIssues=${maxIssues})`,
  );
  acquireLock(lockFile);

  try {
    const issue = pickIssue(repo, maxIssues);
    if (!issue) {
      log("no eligible issues — done");
      await discord(`🌙 AI backlog worker: no eligible issues in **${repo}** tonight.`);
      exitCode = exitCodeAfterAttempt({ prUrl: null, dryRun, hadIssue: false });
      return;
    }
    log(`picked issue #${issue.number}: ${issue.title}`);

    if (dryRun) {
      log("--dry-run, stopping");
      await discord(
        `🔍 AI backlog worker dry-run: would attempt **#${issue.number}** ${issue.title}\n${repo}#${issue.number}`,
      );
      exitCode = exitCodeAfterAttempt({ prUrl: null, dryRun: true, hadIssue: true });
      return;
    }

    // worktree
    const repoLocal = `${homedir()}/repos/${repo.split("/")[1]}`;
    if (!existsSync(repoLocal)) throw new Error(`local repo not cloned: ${repoLocal}`);
    sh(`git -C ${repoLocal} fetch origin --quiet`);
    const wtPath = `/tmp/ai-backlog-${repo.replace("/", "-")}-${issue.number}-${Date.now()}`;
    const branch = `ai-backlog/${issue.number}-${TODAY}`;
    sh(`git -C ${repoLocal} worktree add ${wtPath} -b ${branch} origin/main`);
    log(`worktree at ${wtPath} on ${branch}`);

    const deadline = Date.now() + MAX_WALL_CLOCK_MS;
    const prompt = buildPrompt(issue, branch, wtPath, repo);

    let result;
    try {
      result = spawnAgent(prompt, wtPath, deadline);
    } catch (e) {
      result = { code: -1, stdout: "", stderr: e.message, timedOut: false };
    }

    log(`agent exit code: ${result.code} timedOut: ${result.timedOut}`);
    if (result.stderr) log(`stderr: ${result.stderr.slice(0, 1000)}`);

    // Check for PR opened in last 30min on branch
    let prUrl = null;
    try {
      const prs = JSON.parse(
        sh(`gh pr list --repo ${repo} --head ${branch} --json number,url --state open`),
      );
      if (prs[0]) prUrl = prs[0].url;
    } catch {}

    if (prUrl) {
      log(`success: ${prUrl}`);
      await discord(
        `🤖 AI backlog worker shipped **#${issue.number}** → ${prUrl}\nReview needed; no auto-merge enabled.`,
      );
    } else {
      log(`failure: no PR opened`);
      try {
        sh(`gh issue edit ${issue.number} --repo ${repo} --add-label ai-pickup-failed`);
        sh(
          `gh issue comment ${issue.number} --repo ${repo} --body "AI backlog worker attempted ${TODAY} and failed (exit=${result.code}${
            result.timedOut ? ", timed out" : ""
          }). Cooldown 7d."`,
        );
      } catch (e) {
        log(`label/comment failed: ${e.message}`);
      }
      await discord(
        `⚠️ AI backlog worker failed on **#${issue.number}** ${issue.title}\nExit ${result.code}${
          result.timedOut ? " (timed out)" : ""
        }. Logged + cooled down 7d.\n${repo}#${issue.number}`,
      );
    }

    exitCode = exitCodeAfterAttempt({ prUrl, dryRun: false, hadIssue: true });

    // cleanup worktree
    try { sh(`git -C ${repoLocal} worktree remove --force ${wtPath}`); } catch {}
  } finally {
    releaseLock(lockFile);
    log(exitCode ? "finished with errors" : "done");
    process.exitCode = exitCode;
  }
}

const isMain =
  Boolean(process.argv[1]) &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch(async (e) => {
    log(`FATAL: ${e.message}`);
    await discord(`💥 AI backlog worker crashed: ${e.message}`);
    process.exit(1);
  });
}
