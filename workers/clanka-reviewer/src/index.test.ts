import { describe, expect, it } from "vitest";
import worker from "./index";

const CLEAN_ADDED_DIFF = [
  "diff --git a/src/ok.ts b/src/ok.ts",
  "--- a/src/ok.ts",
  "+++ b/src/ok.ts",
  "@@ -0,0 +1 @@",
  "+const x = 1;",
].join("\n");

const DELETIONS_ONLY_DIFF = [
  "diff --git a/src/gone.ts b/src/gone.ts",
  "--- a/src/gone.ts",
  "+++ b/src/gone.ts",
  "@@ -1 +0,0 @@",
  "-const x = 1;",
].join("\n");

const CONSOLE_LOG_DIFF = [
  "diff --git a/src/debug.ts b/src/debug.ts",
  "--- a/src/debug.ts",
  "+++ b/src/debug.ts",
  "@@ -0,0 +1 @@",
  "+console.log('debug');",
].join("\n");

async function postReview(body: unknown): Promise<{ status: number; payload: Record<string, unknown> }> {
  const response = await worker.fetch(
    new Request("https://reviewer.local/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return {
    status: response.status,
    payload: (await response.json()) as Record<string, unknown>,
  };
}

describe("clanka-reviewer honesty", () => {
  it("does not report a clean 100 score for non-diff text", async () => {
    const { status, payload } = await postReview({
      diff: "just some comments, no diff markers",
    });

    expect(status).toBe(400);
    expect(String(payload.error)).toMatch(/not a recognizable unified\/git diff/i);
    expect(payload.score).not.toBe(100);
    expect(JSON.stringify(payload)).not.toMatch(/No heuristic issues found/);
  });

  it("does not treat deletions-only diffs as a clean scan", async () => {
    const { status, payload } = await postReview({ diff: DELETIONS_ONLY_DIFF });

    expect(status).toBe(200);
    expect(payload.score).toBeNull();
    expect(String(payload.summary)).not.toMatch(/No heuristic issues found/);
    expect(String(payload.summary)).toMatch(/No added lines/i);
    expect(String(payload.summary)).toMatch(/did not run|nothing was scanned/i);
  });

  it("does not claim unused context was considered", async () => {
    const { status, payload } = await postReview({
      diff: CLEAN_ADDED_DIFF,
      context: "focus on auth flows",
    });

    expect(status).toBe(200);
    expect(String(payload.summary)).not.toMatch(/Context provided/i);
    expect(String(payload.summary)).not.toMatch(/Context considered/i);
    expect(String(payload.summary)).toMatch(/context was ignored/i);
  });

  it("still reports a genuine clean scan when added lines have no heuristic hits", async () => {
    const { status, payload } = await postReview({ diff: CLEAN_ADDED_DIFF });

    expect(status).toBe(200);
    expect(payload.score).toBe(100);
    expect(String(payload.summary)).toMatch(/No heuristic issues found in diff\. Score: 100\/100\./);
    expect(String(payload.summary)).not.toMatch(/context/i);
  });

  it("appends the ignored-context note even when issues are found", async () => {
    const { status, payload } = await postReview({
      diff: CONSOLE_LOG_DIFF,
      context: "please weigh security",
    });

    expect(status).toBe(200);
    expect(payload.score).toBe(90);
    expect(String(payload.summary)).toMatch(/Found 1 issue/);
    expect(String(payload.summary)).not.toMatch(/Context considered/i);
    expect(String(payload.summary)).toMatch(/context was ignored/i);
  });
});
