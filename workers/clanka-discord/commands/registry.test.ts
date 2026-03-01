import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildRiskSummary,
  commandRegistry,
  parseCommandOptions,
  validatePrUrl,
  type CommandExecutionEnvironment,
} from "./registry";

const commandEnv: CommandExecutionEnvironment = {
  GITHUB_TOKEN: "token",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

describe("validatePrUrl", () => {
  it("accepts a valid GitHub pull request URL", () => {
    expect(validatePrUrl("https://github.com/example/repo/pull/123")).toEqual({
      valid: true,
    });
  });

  it("rejects non-GitHub URLs with a clear error", () => {
    const result = validatePrUrl("https://gitlab.com/example/repo/-/merge_requests/12");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Only GitHub pull request URLs are supported.");
  });

  it("rejects URLs that omit a pull request number", () => {
    const result = validatePrUrl("https://github.com/example/repo/pull/");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Missing pull request number in URL.");
  });
});

describe("parseCommandOptions", () => {
  it("parses /review command options and returns pr_url", () => {
    const parsed = parseCommandOptions("review", [
      { name: "pr_url", value: "https://github.com/example/repo/pull/7" },
    ]);

    expect(parsed).toEqual({
      valid: true,
      command: "review",
      args: { pr_url: "https://github.com/example/repo/pull/7" },
    });
  });

  it("parses /scan command options and returns repo", () => {
    const parsed = parseCommandOptions("scan", [
      { name: "repo", value: "example/repo" },
    ]);

    expect(parsed).toEqual({
      valid: true,
      command: "scan",
      args: { repo: "example/repo" },
    });
  });

  it("returns a helpful error for unknown commands", () => {
    const parsed = parseCommandOptions("shipit", []);
    expect(parsed.valid).toBe(false);
    if (parsed.valid) {
      throw new Error("Expected parseCommandOptions to reject unknown commands");
    }
    expect(parsed.error).toContain("Unknown command `/shipit`");
    expect(parsed.error).toContain("/help");
  });
});

describe("buildRiskSummary", () => {
  it("maps low-range scores to low risk", () => {
    const summary = buildRiskSummary(33);
    expect(summary.level).toBe("low");
    expect(summary.score).toBe(33);
    expect(summary.reasons.length).toBeGreaterThan(0);
  });

  it("maps medium-range scores to medium risk", () => {
    const summary = buildRiskSummary(60);
    expect(summary.level).toBe("medium");
    expect(summary.score).toBe(60);
    expect(summary.reasons.length).toBeGreaterThan(0);
  });

  it("maps high-range scores to high risk", () => {
    const summary = buildRiskSummary(90);
    expect(summary.level).toBe("high");
    expect(summary.score).toBe(90);
    expect(summary.reasons.length).toBeGreaterThan(0);
  });
});

describe("/review response payload", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("includes riskSummary in the command response payload", async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            user: { login: "octocat" },
            title: "Improve parser behavior",
            additions: 12,
            deletions: 4,
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          [
            "diff --git a/src/app.ts b/src/app.ts",
            "--- a/src/app.ts",
            "+++ b/src/app.ts",
            "@@ -1,2 +1,2 @@",
            "-export const a = 1;",
            "+export const a = 2;",
          ].join("\n"),
          { status: 200 }
        )
      );

    const response = await commandRegistry.review({
      data: {
        name: "review",
        options: [{ name: "pr_url", value: "https://github.com/example/repo/pull/123" }],
      },
      env: commandEnv,
    });

    expect(response.type).toBe(4);
    expect(response.data?.content).toContain("**Risk:**");
    expect(response.data?.riskSummary).toBeDefined();
    expect(response.data?.riskSummary?.score).toBeTypeOf("number");
    expect(response.data?.riskSummary?.reasons.length).toBeGreaterThan(0);
    expect(["low", "medium", "high"]).toContain(response.data?.riskSummary?.level);
  });
});
