import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  commandRegistry,
  type CommandExecutionEnvironment,
  type DiscordInteraction,
} from "./registry";

const commandEnv: CommandExecutionEnvironment = {
  GITHUB_TOKEN: "github-token",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

const makeReviewInteraction = (prUrl?: unknown): DiscordInteraction => ({
  data: {
    name: "review",
    options: prUrl === undefined ? [] : [{ name: "pr_url", value: prUrl as string }],
  },
  env: commandEnv,
});

const makeFeedbackInteraction = (
  limit?: string | number | boolean
): DiscordInteraction => ({
  data: {
    name: "feedback",
    options: limit === undefined ? [] : [{ name: "limit", value: limit }],
  },
  env: commandEnv,
});

describe("commandRegistry handlers", () => {
  it("registers all expected handlers", () => {
    expect(Object.keys(commandRegistry).sort()).toEqual([
      "feedback",
      "help",
      "review",
      "status",
    ]);
  });

  it("maps every registered command to a callable function", () => {
    for (const handler of Object.values(commandRegistry)) {
      expect(typeof handler).toBe("function");
    }
  });

  it("returns an operational response for /status", async () => {
    const response = await commandRegistry.status({ env: commandEnv });
    expect(response.type).toBe(4);
    expect(response.data?.content).toContain("CLANKA: Operational");
  });

  it("returns command usage help for /help", async () => {
    const response = await commandRegistry.help({ env: commandEnv });
    expect(response.type).toBe(4);
    expect(response.data?.content).toContain("/status");
    expect(response.data?.content).toContain("/review");
    expect(response.data?.content).toContain("/feedback");
    expect(response.data?.content).toContain("/help");
  });
});

describe("commandRegistry.feedback", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns service unavailable when Supabase fetch rejects", async () => {
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error("network down"));

    const response = await commandRegistry.feedback(makeFeedbackInteraction());
    expect(response.data?.content).toContain("Feedback service is temporarily unavailable");
  });

  it("returns service unavailable when Supabase response is not ok", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response("forbidden", { status: 403 })
    );

    const response = await commandRegistry.feedback(makeFeedbackInteraction());
    expect(response.data?.content).toContain("Feedback service is temporarily unavailable");
  });

  it("returns service unavailable when Supabase payload is malformed JSON", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response("not-json", { status: 200 })
    );

    const response = await commandRegistry.feedback(makeFeedbackInteraction());
    expect(response.data?.content).toContain("Feedback service is temporarily unavailable");
  });

  it("returns a no-feedback message when the payload is empty", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 })
    );

    const response = await commandRegistry.feedback(makeFeedbackInteraction());
    expect(response.data?.content).toContain("No recent user feedback found");
  });

  it("returns a no-feedback message when payload is not an array", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 })
    );

    const response = await commandRegistry.feedback(makeFeedbackInteraction());
    expect(response.data?.content).toContain("No recent user feedback found");
  });

  it("formats multiple feedback entries", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            category: "Bug",
            message: "First issue",
            status: "open",
            page_path: "/home",
          },
          {
            category: "UX",
            message: "Second issue",
            status: "triaged",
            page_path: "/settings",
          },
        ]),
        { status: 200 }
      )
    );

    const response = await commandRegistry.feedback(makeFeedbackInteraction(2));
    expect(response.data?.content).toContain("Latest User Feedback (Last 2)");
    expect(response.data?.content).toContain("**[Bug]** First issue");
    expect(response.data?.content).toContain("Status: open | Page: /home");
    expect(response.data?.content).toContain("**[UX]** Second issue");
  });

  it("falls back to default label values when fields are missing", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([{}]), { status: 200 })
    );

    const response = await commandRegistry.feedback(makeFeedbackInteraction());
    expect(response.data?.content).toContain("**[Uncategorized]** No message content");
    expect(response.data?.content).toContain("Status: unknown | Page: unknown");
  });

  it("truncates long feedback messages to 100 chars with ellipsis", async () => {
    const message = "x".repeat(120);
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify([{ category: "Bug", message, status: "open", page_path: "/home" }]),
        { status: 200 }
      )
    );

    const response = await commandRegistry.feedback(makeFeedbackInteraction());
    const truncated = `${"x".repeat(100)}...`;
    expect(response.data?.content).toContain(truncated);
  });

  it("uses the default limit of 5 when no limit option is provided", async () => {
    const fetchSpy = vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 })
    );

    await commandRegistry.feedback(makeFeedbackInteraction());

    const [requestUrl] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(requestUrl).toContain("limit=5");
  });

  it("floors decimal limit values", async () => {
    const fetchSpy = vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 })
    );

    await commandRegistry.feedback(makeFeedbackInteraction(3.9));

    const [requestUrl] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(requestUrl).toContain("limit=3");
  });

  it("falls back to limit=5 when limit is zero", async () => {
    const fetchSpy = vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 })
    );

    await commandRegistry.feedback(makeFeedbackInteraction(0));

    const [requestUrl] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(requestUrl).toContain("limit=5");
  });

  it("falls back to limit=5 when limit is negative", async () => {
    const fetchSpy = vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 })
    );

    await commandRegistry.feedback(makeFeedbackInteraction(-8));

    const [requestUrl] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(requestUrl).toContain("limit=5");
  });

  it("falls back to limit=5 when limit is NaN-like", async () => {
    const fetchSpy = vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 })
    );

    await commandRegistry.feedback(makeFeedbackInteraction("not-a-number"));

    const [requestUrl] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(requestUrl).toContain("limit=5");
  });

  it("accepts boolean limit=true as numeric 1", async () => {
    const fetchSpy = vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 })
    );

    await commandRegistry.feedback(makeFeedbackInteraction(true));

    const [requestUrl] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(requestUrl).toContain("limit=1");
  });

  it("sends Supabase auth headers on feedback requests", async () => {
    const fetchSpy = vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 })
    );

    await commandRegistry.feedback(makeFeedbackInteraction());

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.apikey).toBe(commandEnv.SUPABASE_SERVICE_ROLE_KEY);
    expect(headers.Authorization).toBe(`Bearer ${commandEnv.SUPABASE_SERVICE_ROLE_KEY}`);
    expect(headers["Content-Type"]).toBe("application/json");
  });
});

describe("commandRegistry.review", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an argument error when pr_url is missing", async () => {
    const response = await commandRegistry.review(makeReviewInteraction());
    expect(response.data?.content).toContain("Missing or invalid `pr_url` argument.");
  });

  it("returns an argument error when pr_url is not a string", async () => {
    const response = await commandRegistry.review(makeReviewInteraction(123));
    expect(response.data?.content).toContain("Missing or invalid `pr_url` argument.");
  });

  it("returns a shield alert for blocked prompt-injection input", async () => {
    const response = await commandRegistry.review(
      makeReviewInteraction("javascript:alert(1)")
    );

    expect(response.data?.content).toContain("Shield Alert");
  });

  it("rejects invalid URL format", async () => {
    const response = await commandRegistry.review(makeReviewInteraction("not-a-url"));
    expect(response.data?.content).toContain("Invalid URL format.");
  });

  it("rejects non-GitHub pull request URLs", async () => {
    const response = await commandRegistry.review(
      makeReviewInteraction("https://gitlab.com/example/repo/-/merge_requests/1")
    );

    expect(response.data?.content).toContain("Only GitHub pull request URLs are supported.");
  });

  it("rejects GitHub URLs with missing PR number", async () => {
    const response = await commandRegistry.review(
      makeReviewInteraction("https://github.com/example/repo/pull/")
    );

    expect(response.data?.content).toContain("Missing pull request number in URL.");
  });

  it("rejects GitHub URLs with non-numeric PR number", async () => {
    const response = await commandRegistry.review(
      makeReviewInteraction("https://github.com/example/repo/pull/abc")
    );

    expect(response.data?.content).toContain("Invalid GitHub PR URL.");
  });

  it("returns service unavailable when GitHub requests reject", async () => {
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error("network down"));

    const response = await commandRegistry.review(
      makeReviewInteraction("https://github.com/example/repo/pull/9")
    );

    expect(response.data?.content).toContain("PR Review service is temporarily unavailable");
  });

  it("returns service unavailable when PR response is non-ok", async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(new Response("forbidden", { status: 403 }))
      .mockResolvedValueOnce(new Response("diff text", { status: 200 }));

    const response = await commandRegistry.review(
      makeReviewInteraction("https://github.com/example/repo/pull/9")
    );

    expect(response.data?.content).toContain("PR Review service is temporarily unavailable");
  });

  it("returns service unavailable when PR JSON payload is malformed", async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(new Response("not-json", { status: 200 }))
      .mockResolvedValueOnce(new Response("diff text", { status: 200 }));

    const response = await commandRegistry.review(
      makeReviewInteraction("https://github.com/example/repo/pull/9")
    );

    expect(response.data?.content).toContain("PR Review service is temporarily unavailable");
  });

  it("returns service unavailable when diff body cannot be read", async () => {
    const diffResponse = {
      ok: true,
      text: vi.fn().mockRejectedValue(new Error("stream closed")),
    } as unknown as Response;

    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            user: { login: "octocat" },
            title: "Refactor module",
            additions: 2,
            deletions: 1,
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(diffResponse);

    const response = await commandRegistry.review(
      makeReviewInteraction("https://github.com/example/repo/pull/9")
    );

    expect(response.data?.content).toContain("PR Review service is temporarily unavailable");
  });

  it("still returns a review when diff endpoint is non-ok", async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            user: { login: "octocat" },
            title: "Refactor module",
            additions: 2,
            deletions: 1,
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response("not found", { status: 404 }));

    const response = await commandRegistry.review(
      makeReviewInteraction("https://github.com/example/repo/pull/9")
    );

    expect(response.data?.content).toContain("PR Review: #9 in example/repo");
    expect(response.data?.content).toContain("**Risk:** LOW (0/100)");
    expect(response.data?.riskSummary?.level).toBe("low");
  });

  it("formats a successful review payload with risk summary", async () => {
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
            "@@ -1 +1 @@",
            "-export const oldValue = 1;",
            "+export const newValue = 2;",
          ].join("\n"),
          { status: 200 }
        )
      );

    const response = await commandRegistry.review(
      makeReviewInteraction("https://github.com/example/repo/pull/123")
    );

    expect(response.type).toBe(4);
    expect(response.data?.content).toContain("PR Review: #123 in example/repo");
    expect(response.data?.content).toContain("Title:** Improve parser behavior");
    expect(response.data?.content).toContain("Author:** octocat");
    expect(response.data?.content).toContain("Diff:** +12 / -4");
    expect(response.data?.content).toContain("Risk:");
    expect(response.data?.riskSummary).toBeDefined();
  });

  it("falls back to default title/author/diff counts when PR fields are missing", async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(new Response("", { status: 200 }));

    const response = await commandRegistry.review(
      makeReviewInteraction("https://github.com/example/repo/pull/7")
    );

    expect(response.data?.content).toContain("Title:** Untitled");
    expect(response.data?.content).toContain("Author:**");
    expect(response.data?.content).toContain("Diff:** +0 / -0");
  });

  it("accepts GitHub URLs on the www subdomain", async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(new Response("", { status: 200 }));

    const response = await commandRegistry.review(
      makeReviewInteraction("https://www.github.com/example/repo/pull/21")
    );

    expect(response.data?.content).toContain("PR Review: #21 in example/repo");
  });

  it("sends GitHub token and expected Accept headers in both review fetches", async () => {
    const fetchSpy = vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(new Response("", { status: 200 }));

    await commandRegistry.review(makeReviewInteraction("https://github.com/example/repo/pull/4"));

    const [, firstInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const [, secondInit] = fetchSpy.mock.calls[1] as [string, RequestInit];
    const firstHeaders = firstInit.headers as Record<string, string>;
    const secondHeaders = secondInit.headers as Record<string, string>;

    expect(firstHeaders.Authorization).toBe("Bearer github-token");
    expect(firstHeaders.Accept).toBe("application/vnd.github.v3+json");
    expect(secondHeaders.Authorization).toBe("Bearer github-token");
    expect(secondHeaders.Accept).toBe("application/vnd.github.v3.diff");
  });

  it("handles PR payloads that parse to null by using safe defaults", async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(new Response("null", { status: 200 }))
      .mockResolvedValueOnce(new Response("", { status: 200 }));

    const response = await commandRegistry.review(
      makeReviewInteraction("https://github.com/example/repo/pull/2")
    );

    expect(response.data?.content).toContain("Title:** Untitled");
    expect(response.data?.content).toContain("Diff:** +0 / -0");
  });

  it("returns high risk summary for large src-only diffs", async () => {
    const addedLines = Array.from({ length: 120 }, (_, index) => `+const x${index} = ${index};`);
    const diffText = [
      "diff --git a/src/risk.ts b/src/risk.ts",
      "--- a/src/risk.ts",
      "+++ b/src/risk.ts",
      "@@ -0,0 +1,120 @@",
      ...addedLines,
    ].join("\n");

    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(new Response(diffText, { status: 200 }));

    const response = await commandRegistry.review(
      makeReviewInteraction("https://github.com/example/repo/pull/88")
    );

    expect(response.data?.riskSummary?.level).toBe("high");
    expect(response.data?.riskSummary?.score).toBeGreaterThanOrEqual(67);
  });

  it("returns low risk summary for tiny non-src diffs", async () => {
    const diffText = [
      "diff --git a/README.md b/README.md",
      "--- a/README.md",
      "+++ b/README.md",
      "@@ -1 +1 @@",
      "-old",
      "+new",
    ].join("\n");

    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(new Response(diffText, { status: 200 }));

    const response = await commandRegistry.review(
      makeReviewInteraction("https://github.com/example/repo/pull/89")
    );

    expect(response.data?.riskSummary?.level).toBe("low");
    expect(response.data?.riskSummary?.score).toBeLessThanOrEqual(33);
  });

  it("returns service unavailable when one of Promise.all fetches rejects", async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockRejectedValueOnce(new Error("diff endpoint failed"));

    const response = await commandRegistry.review(
      makeReviewInteraction("https://github.com/example/repo/pull/99")
    );

    expect(response.data?.content).toContain("PR Review service is temporarily unavailable");
  });
});
