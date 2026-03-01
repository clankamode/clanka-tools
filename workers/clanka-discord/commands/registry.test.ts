import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildRiskSummary,
  commandRegistry,
  getCommandHandler,
  getCommandSchema,
  parseCommandOptions,
  validatePrUrl,
  type CommandExecutionEnvironment,
  type RuntimeCommandName,
} from "./registry";

const commandEnv: CommandExecutionEnvironment = {
  GITHUB_TOKEN: "token",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

const requireHandler = (name: RuntimeCommandName) => {
  const handler = getCommandHandler(name);
  if (!handler) {
    throw new Error(`Missing command handler for ${name}`);
  }
  return handler;
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

  it("rejects empty values", () => {
    const result = validatePrUrl("");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Missing PR URL.");
  });

  it("rejects invalid URL formats", () => {
    const result = validatePrUrl("not-a-valid-url");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid URL format.");
  });

  it("rejects non-PR GitHub URLs", () => {
    const result = validatePrUrl("https://github.com/example/repo/issues/10");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid GitHub PR URL.");
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
    const parsed = parseCommandOptions("scan", [{ name: "repo", value: "example/repo" }]);

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

  it("returns an error when command name is missing", () => {
    const parsed = parseCommandOptions(undefined, []);
    expect(parsed.valid).toBe(false);
    if (parsed.valid) {
      throw new Error("Expected parseCommandOptions to reject missing command names");
    }
    expect(parsed.error).toBe("Missing command name. Try `/help`.");
  });

  it("returns an error when /review omits pr_url", () => {
    const parsed = parseCommandOptions("review", []);
    expect(parsed.valid).toBe(false);
    if (parsed.valid) {
      throw new Error("Expected /review to reject missing pr_url");
    }
    expect(parsed.error).toBe("Missing or invalid `pr_url` argument.");
  });

  it("returns an error when /review pr_url is not a string", () => {
    const parsed = parseCommandOptions("review", [{ name: "pr_url", value: 123 }]);
    expect(parsed.valid).toBe(false);
    if (parsed.valid) {
      throw new Error("Expected /review to reject non-string pr_url");
    }
    expect(parsed.error).toBe("Missing or invalid `pr_url` argument.");
  });

  it("returns an error when /scan omits repo", () => {
    const parsed = parseCommandOptions("scan", []);
    expect(parsed.valid).toBe(false);
    if (parsed.valid) {
      throw new Error("Expected /scan to reject missing repo");
    }
    expect(parsed.error).toBe("Missing or invalid `repo` argument.");
  });
});

describe("runtime command registry integration", () => {
  it("loads all runtime command schemas", () => {
    expect(commandRegistry).toHaveLength(4);
    expect(commandRegistry.map((command) => command.name)).toEqual([
      "status",
      "review",
      "feedback",
      "help",
    ]);
  });

  it("stores a description and handler on each command", () => {
    for (const command of commandRegistry) {
      expect(command.description.length).toBeGreaterThan(0);
      expect(command.handler).toBeTypeOf("function");
    }
  });

  it("looks up /status by command name", () => {
    const command = getCommandSchema("status");
    expect(command?.name).toBe("status");
    expect(command?.description).toContain("status");
  });

  it("looks up /review metadata including option schema", () => {
    const command = getCommandSchema("review");
    expect(command?.name).toBe("review");
    expect(command?.options).toEqual([
      {
        type: 3,
        name: "pr_url",
        description: "The URL of the GitHub PR",
        required: true,
      },
    ]);
  });

  it("resolves /help handler by name", () => {
    expect(getCommandHandler("help")).toBeTypeOf("function");
  });

  it("returns undefined for unknown command names", () => {
    expect(getCommandSchema("shipit")).toBeUndefined();
    expect(getCommandHandler("shipit")).toBeUndefined();
  });

  it("keeps command names unique", () => {
    const names = commandRegistry.map((command) => command.name);
    expect(new Set(names).size).toBe(names.length);
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

  it("maps score 34 into medium risk", () => {
    const summary = buildRiskSummary(34);
    expect(summary.level).toBe("medium");
  });

  it("maps score 67 into high risk", () => {
    const summary = buildRiskSummary(67);
    expect(summary.level).toBe("high");
  });
});

describe("runtime command handlers", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns operational message for /status", async () => {
    const statusHandler = requireHandler("status");
    const response = await statusHandler({ env: commandEnv });
    expect(response.type).toBe(4);
    expect(response.data?.content).toContain("CLANKA: Operational");
  });

  it("returns command list for /help", async () => {
    const helpHandler = requireHandler("help");
    const response = await helpHandler({ env: commandEnv });
    expect(response.type).toBe(4);
    expect(response.data?.content).toContain("/status");
    expect(response.data?.content).toContain("/review");
    expect(response.data?.content).toContain("/feedback");
    expect(response.data?.content).toContain("/help");
  });

  it("returns empty-state message for /feedback when no records exist", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    const feedbackHandler = requireHandler("feedback");
    const response = await feedbackHandler({
      data: {
        name: "feedback",
        options: [{ name: "limit", value: 2 }],
      },
      env: commandEnv,
    });

    expect(response.data?.content).toContain("No recent user feedback found");
  });

  it("defaults /feedback limit to 5 for invalid values", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    const feedbackHandler = requireHandler("feedback");
    await feedbackHandler({
      data: {
        name: "feedback",
        options: [{ name: "limit", value: "invalid-number" }],
      },
      env: commandEnv,
    });

    const [firstCallUrl] = vi.mocked(globalThis.fetch).mock.calls[0] ?? [];
    expect(String(firstCallUrl)).toContain("limit=5");
  });

  it("truncates long feedback entries in /feedback response", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            category: "UX",
            message: "x".repeat(120),
            status: "new",
            page_path: "/home",
          },
        ]),
        { status: 200 }
      )
    );
    const feedbackHandler = requireHandler("feedback");
    const response = await feedbackHandler({
      data: {
        name: "feedback",
      },
      env: commandEnv,
    });

    expect(response.data?.content).toContain("...");
    expect(response.data?.content).toContain("[UX]");
  });

  it("includes riskSummary in /review response payload", async () => {
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
    const reviewHandler = requireHandler("review");
    const response = await reviewHandler({
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
