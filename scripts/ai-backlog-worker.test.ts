import { describe, expect, it } from "vitest";
import {
  exitCodeAfterAttempt,
  isIssueEligible,
  parseCliArgs,
  usageText,
  MAX_ISSUES_HARD_BOUND,
} from "./ai-backlog-worker.mjs";

describe("ai-backlog-worker CLI honesty", () => {
  it("rejects --max-issues values above the hard bound instead of ignoring them", () => {
    const equalsForm = parseCliArgs(["--max-issues=5"]);
    expect(equalsForm.ok).toBe(false);
    if (equalsForm.ok) {
      throw new Error("expected --max-issues=5 to fail");
    }
    expect(equalsForm.error).toMatch(/at most 1/i);
    expect(equalsForm.error).toContain("5");

    const spaceForm = parseCliArgs(["--max-issues", "3"]);
    expect(spaceForm.ok).toBe(false);
    if (spaceForm.ok) {
      throw new Error("expected --max-issues 3 to fail");
    }
    expect(spaceForm.error).toMatch(/at most 1/i);
  });

  it("accepts --max-issues=1 as the documented hard bound", () => {
    const parsed = parseCliArgs(["--max-issues=1"]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.help) {
      throw new Error("expected a runnable parse of --max-issues=1");
    }
    expect(parsed.maxIssues).toBe(MAX_ISSUES_HARD_BOUND);
  });

  it("honors space-form --repo owner/name instead of silently using the default", () => {
    const parsed = parseCliArgs(["--repo", "acme/widget"], {});
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.help) {
      throw new Error("expected space-form --repo to parse");
    }
    expect(parsed.repo).toBe("acme/widget");
  });

  it("fails loudly on unknown flags rather than starting a real run", () => {
    const parsed = parseCliArgs(["--pretty"]);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) {
      throw new Error("expected unknown flags to fail");
    }
    expect(parsed.error).toMatch(/Unknown flag: --pretty/);
  });

  it("prints help without treating --help as a silent no-op", () => {
    const parsed = parseCliArgs(["--help"]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      throw new Error("expected --help to succeed");
    }
    expect(parsed.help).toBe(true);
    expect(usageText()).toMatch(/--dry-run/);
    expect(usageText()).toMatch(/at most 1 issue/i);
  });
});

describe("ai-backlog-worker pickup cooldown honesty", () => {
  const now = Date.parse("2026-10-21T00:00:00.000Z");
  const eligibleLabels = [{ name: "ai-pickup-eligible" }];

  it("does not retry ai-pickup-failed issues when comments are missing", () => {
    expect(
      isIssueEligible(
        { labels: [...eligibleLabels, { name: "ai-pickup-failed" }], comments: [] },
        now,
      ),
    ).toBe(false);
    expect(
      isIssueEligible(
        { labels: [...eligibleLabels, { name: "ai-pickup-failed" }] },
        now,
      ),
    ).toBe(false);
  });

  it("does not treat an unparseable comment timestamp as cooldown expiry", () => {
    expect(
      isIssueEligible(
        {
          labels: [...eligibleLabels, { name: "ai-pickup-failed" }],
          comments: [{ createdAt: "not-a-date" }],
        },
        now,
      ),
    ).toBe(false);
  });

  it("still retries after the cooldown window when the last comment is old enough", () => {
    expect(
      isIssueEligible(
        {
          labels: [...eligibleLabels, { name: "ai-pickup-failed" }],
          comments: [{ createdAt: "2026-10-10T00:00:00.000Z" }],
        },
        now,
      ),
    ).toBe(true);
    expect(
      isIssueEligible(
        {
          labels: [...eligibleLabels, { name: "ai-pickup-failed" }],
          comments: [{ createdAt: "2026-10-16T00:00:00.000Z" }],
        },
        now,
      ),
    ).toBe(false);
  });
});

describe("ai-backlog-worker exit codes", () => {
  it("exits non-zero when an issue was attempted but no PR opened", () => {
    expect(
      exitCodeAfterAttempt({ prUrl: null, dryRun: false, hadIssue: true }),
    ).toBe(1);
  });

  it("exits zero for dry-run, no-issue, and successful PR paths", () => {
    expect(
      exitCodeAfterAttempt({ prUrl: null, dryRun: true, hadIssue: true }),
    ).toBe(0);
    expect(
      exitCodeAfterAttempt({ prUrl: null, dryRun: false, hadIssue: false }),
    ).toBe(0);
    expect(
      exitCodeAfterAttempt({
        prUrl: "https://github.com/acme/widget/pull/1",
        dryRun: false,
        hadIssue: true,
      }),
    ).toBe(0);
  });
});
