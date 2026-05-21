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
 *   --dry-run        Pick + log but don't spawn agent or open PR
 *   --max-issues N   Override (default 1)
 *   --repo X/Y       Override env REPO
 */

import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync, mkdirSync, readFileSync, unlinkSync, statSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";

const DRY_RUN = process.argv.includes("--dry-run");
const MAX_ISSUES = Number(
  (process.argv.find((a) => a.startsWith("--max-issues=")) || "=1").split("=")[1] || 1,
);
const REPO =
  (process.argv.find((a) => a.startsWith("--repo=")) || "").split("=")[1] ||
  process.env.AI_BACKLOG_REPO ||
  "clankamode/exterior-crm";

const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL;
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const COOLDOWN_DAYS = 7;
const MAX_WALL_CLOCK_MS = 30 * 60 * 1000;

const LOCK_FILE = `/tmp/ai-backlog-${REPO.replace("/", "-")}.lock`;
const TODAY = new Date().toISOString().slice(0, 10);
const LOG_DIR = join(homedir(), ".cache", "ai-backlog-worker");
mkdirSync(LOG_DIR, { recursive: true });
const LOG_PATH = join(LOG_DIR, `${TODAY}.log`);

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
function acquireLock() {
  if (existsSync(LOCK_FILE)) {
    const age = Date.now() - statSync(LOCK_FILE).mtimeMs;
    // stale > 24h → reclaim
    if (age < 24 * 60 * 60 * 1000) {
      const owner = readFileSync(LOCK_FILE, "utf8");
      throw new Error(`lock held: ${owner} (age ${Math.round(age / 1000 / 60)}min)`);
    }
    log(`reclaiming stale lock (${Math.round(age / 1000 / 60)}min old)`);
  }
  writeFileSync(LOCK_FILE, `${process.pid} ${new Date().toISOString()}`);
}
function releaseLock() {
  try { unlinkSync(LOCK_FILE); } catch {}
}

// ─── issue selection ──────────────────────────────────────────────────────
function pickIssue() {
  const raw = sh(
    `gh issue list --repo ${REPO} ` +
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
  return eligible[0] || null;
}

// ─── agent prompt ─────────────────────────────────────────────────────────
function buildPrompt(issue, branch, worktree) {
  return `CONTEXT
You are an autonomous backlog worker. You have been spawned to attempt issue #${issue.number} from ${REPO}.

REPO: ${REPO}
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
  log(`AI Backlog Worker starting (repo=${REPO}, dryRun=${DRY_RUN})`);
  acquireLock();

  try {
    const issue = pickIssue();
    if (!issue) {
      log("no eligible issues — done");
      await discord(`🌙 AI backlog worker: no eligible issues in **${REPO}** tonight.`);
      return;
    }
    log(`picked issue #${issue.number}: ${issue.title}`);

    if (DRY_RUN) {
      log("--dry-run, stopping");
      await discord(
        `🔍 AI backlog worker dry-run: would attempt **#${issue.number}** ${issue.title}\n${REPO}#${issue.number}`,
      );
      return;
    }

    // worktree
    const repoLocal = `${homedir()}/repos/${REPO.split("/")[1]}`;
    if (!existsSync(repoLocal)) throw new Error(`local repo not cloned: ${repoLocal}`);
    sh(`git -C ${repoLocal} fetch origin --quiet`);
    const wtPath = `/tmp/ai-backlog-${REPO.replace("/", "-")}-${issue.number}-${Date.now()}`;
    const branch = `ai-backlog/${issue.number}-${TODAY}`;
    sh(`git -C ${repoLocal} worktree add ${wtPath} -b ${branch} origin/main`);
    log(`worktree at ${wtPath} on ${branch}`);

    const deadline = Date.now() + MAX_WALL_CLOCK_MS;
    const prompt = buildPrompt(issue, branch, wtPath);

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
        sh(`gh pr list --repo ${REPO} --head ${branch} --json number,url --state open`),
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
        sh(`gh issue edit ${issue.number} --repo ${REPO} --add-label ai-pickup-failed`);
        sh(
          `gh issue comment ${issue.number} --repo ${REPO} --body "AI backlog worker attempted ${TODAY} and failed (exit=${result.code}${
            result.timedOut ? ", timed out" : ""
          }). Cooldown 7d."`,
        );
      } catch (e) {
        log(`label/comment failed: ${e.message}`);
      }
      await discord(
        `⚠️ AI backlog worker failed on **#${issue.number}** ${issue.title}\nExit ${result.code}${
          result.timedOut ? " (timed out)" : ""
        }. Logged + cooled down 7d.\n${REPO}#${issue.number}`,
      );
    }

    // cleanup worktree
    try { sh(`git -C ${repoLocal} worktree remove --force ${wtPath}`); } catch {}
  } finally {
    releaseLock();
    log("done");
  }
}

main().catch(async (e) => {
  log(`FATAL: ${e.message}`);
  await discord(`💥 AI backlog worker crashed: ${e.message}`);
  releaseLock();
  process.exit(1);
});
