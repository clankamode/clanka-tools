import { describe, it, expect } from "vitest";
import { analyzeDiff, riskScore } from "./spine";

const makeGitDiff = (files: { from: string; to: string; lines: string[] }[]) => {
  return files
    .map(
      ({ from, to, lines }) =>
        `diff --git a/${from} b/${to}\n--- a/${from}\n+++ b/${to}\n` + lines.join("\n")
    )
    .join("\n");
};

describe("analyzeDiff — added-only diff", () => {
  it("detects modified files from diff headers", () => {
    const diff = makeGitDiff([
      { from: "src/foo.ts", to: "src/foo.ts", lines: ["+export const x = 1;", "+const y = 2;"] },
    ]);
    const result = analyzeDiff(diff);
    expect(result.modifiedFiles).toContain("src/foo.ts");
    expect(result.newExports).toBe(1);
  });

  it("counts multiple new exports", () => {
    const diff = makeGitDiff([
      {
        from: "src/utils.ts",
        to: "src/utils.ts",
        lines: ["+export function a() {}", "+export const B = 1;", "+export type C = string;"],
      },
    ]);
    const result = analyzeDiff(diff);
    expect(result.newExports).toBe(3);
  });
});

describe("analyzeDiff — removed-only diff", () => {
  it("detects file in removed-only diff", () => {
    const diff = makeGitDiff([
      { from: "src/old.ts", to: "src/old.ts", lines: ["-const removed = true;", "-export const gone = 0;"] },
    ]);
    const result = analyzeDiff(diff);
    expect(result.modifiedFiles).toContain("src/old.ts");
    expect(result.newExports).toBe(0); // removed exports don't count
  });
});

describe("analyzeDiff — mixed diff", () => {
  it("handles added and removed lines in same file", () => {
    const diff = makeGitDiff([
      {
        from: "src/core.ts",
        to: "src/core.ts",
        lines: ["-const old = 1;", "+const new_ = 2;", "+export const api = {};"],
      },
    ]);
    const result = analyzeDiff(diff);
    expect(result.modifiedFiles).toContain("src/core.ts");
    expect(result.newExports).toBe(1);
  });
});

describe("analyzeDiff — multiple files", () => {
  it("returns unique file list for multi-file diff", () => {
    const diff = makeGitDiff([
      { from: "src/a.ts", to: "src/a.ts", lines: ["+export const a = 1;"] },
      { from: "src/b.ts", to: "src/b.ts", lines: ["+const b = 2;"] },
      { from: "src/c.ts", to: "src/c.ts", lines: ["+export function c() {}"] },
    ]);
    const result = analyzeDiff(diff);
    expect(result.modifiedFiles).toHaveLength(3);
    expect(result.modifiedFiles).toContain("src/a.ts");
    expect(result.modifiedFiles).toContain("src/b.ts");
    expect(result.modifiedFiles).toContain("src/c.ts");
    expect(result.newExports).toBe(2);
  });
});

describe("analyzeDiff — empty diff", () => {
  it("returns empty result for empty string", () => {
    const result = analyzeDiff("");
    expect(result.modifiedFiles).toHaveLength(0);
    expect(result.newExports).toBe(0);
  });

  it("returns empty result for whitespace-only diff", () => {
    const result = analyzeDiff("   \n\n  ");
    expect(result.modifiedFiles).toHaveLength(0);
    expect(result.newExports).toBe(0);
  });
});

describe("analyzeDiff — binary file markers", () => {
  it("includes binary files in modified list (detected via diff header)", () => {
    const diff =
      "diff --git a/assets/logo.png b/assets/logo.png\nBinary files a/assets/logo.png and b/assets/logo.png differ";
    const result = analyzeDiff(diff);
    expect(result.modifiedFiles).toContain("assets/logo.png");
    expect(result.newExports).toBe(0);
  });
});

describe("analyzeDiff — large diff", () => {
  it("handles 1000-line diff without error", () => {
    const lines = Array.from({ length: 500 }, (_, i) => `+const x${i} = ${i};`).concat(
      Array.from({ length: 500 }, (_, i) => `-const old${i} = ${i};`)
    );
    const diff = makeGitDiff([{ from: "src/big.ts", to: "src/big.ts", lines }]);
    expect(() => analyzeDiff(diff)).not.toThrow();
    const result = analyzeDiff(diff);
    expect(result.modifiedFiles).toContain("src/big.ts");
  });
});

describe("analyzeDiff — real unified diff", () => {
  it("counts exports and modified file from a realistic mixed hunk", () => {
    const diff = [
      "diff --git a/src/format.ts b/src/format.ts",
      "index 8f7a2d..c3e8b5 100644",
      "--- a/src/format.ts",
      "+++ b/src/format.ts",
      "@@ -1,7 +1,8 @@",
      " export const trim = (value: string) => value.trim();",
      "-export const format = (value: string) => value;",
      "+export const format = (value: string) => value.trim();",
      " const debug = true;",
      "+const local = format('x');",
      "+export function toUpper(value: string): string {",
      "+  return value.toUpperCase();",
      "+}",
    ].join("\n");

    const result = analyzeDiff(diff);
    expect(result.modifiedFiles).toContain("src/format.ts");
    expect(result.newExports).toBe(2);
  });
});

describe("analyzeDiff — rename diff", () => {
  it("tracks renamed file target path from diff header", () => {
    const diff = [
      "diff --git a/src/legacy.ts b/src/core/legacy.ts",
      "similarity index 100%",
      "rename from src/legacy.ts",
      "rename to src/core/legacy.ts",
      "--- a/src/legacy.ts",
      "+++ b/src/core/legacy.ts",
      "@@ -1,2 +1,2 @@",
      "-export const legacy = 1;",
      "+export const legacy = 2;",
    ].join("\n");

    const result = analyzeDiff(diff);
    expect(result.modifiedFiles).toContain("src/core/legacy.ts");
    expect(result.modifiedFiles).toHaveLength(1);
    expect(result.newExports).toBe(1);
  });
});

describe("analyzeDiff — logicSummary", () => {
  it("includes Industrial Minimalism header in summary", () => {
    const diff = makeGitDiff([{ from: "src/x.ts", to: "src/x.ts", lines: ["+export const x = 1;"] }]);
    const result = analyzeDiff(diff);
    expect(result.logicSummary).toContain("Industrial Minimalism");
    expect(result.logicSummary).toContain("modified-files=1");
    expect(result.logicSummary).toContain("new-exports=1");
  });
});

describe("riskScore", () => {
  it("returns 0 for empty diff", () => {
    expect(riskScore("")).toBe(0);
    expect(riskScore(" \n\t")).toBe(0);
  });

  it("increases as changed lines increase", () => {
    const small = makeGitDiff([
      { from: "src/a.ts", to: "src/a.ts", lines: ["+const a = 1;", "-const a = 0;"] },
    ]);
    const large = makeGitDiff([
      {
        from: "src/a.ts",
        to: "src/a.ts",
        lines: Array.from({ length: 40 }, (_, i) => `+const v${i} = ${i};`),
      },
    ]);

    expect(riskScore(large)).toBeGreaterThan(riskScore(small));
  });

  it("increases as files touched increase", () => {
    const oneFile = makeGitDiff([
      { from: "src/a.ts", to: "src/a.ts", lines: ["+const a = 1;"] },
    ]);
    const threeFiles = makeGitDiff([
      { from: "src/a.ts", to: "src/a.ts", lines: ["+const a = 1;"] },
      { from: "src/b.ts", to: "src/b.ts", lines: ["+const b = 2;"] },
      { from: "src/c.ts", to: "src/c.ts", lines: ["+const c = 3;"] },
    ]);

    expect(riskScore(threeFiles)).toBeGreaterThan(riskScore(oneFile));
  });

  it("reduces score when src changes include corresponding tests", () => {
    const srcOnly = makeGitDiff([
      {
        from: "src/logic.ts",
        to: "src/logic.ts",
        lines: [
          "+export const run = () => true;",
          "+const a = 1;",
          "-const a = 0;",
          "+const b = 2;",
          "-const b = 1;",
        ],
      },
    ]);
    const srcWithTest = makeGitDiff([
      {
        from: "src/logic.ts",
        to: "src/logic.ts",
        lines: ["+export const run = () => true;", "+const a = 1;", "-const a = 0;"],
      },
      {
        from: "src/logic.test.ts",
        to: "src/logic.test.ts",
        lines: ["+import { run } from './logic';", "+it('runs', () => expect(run()).toBe(true));"],
      },
    ]);

    expect(riskScore(srcWithTest)).toBeLessThan(riskScore(srcOnly));
  });

  it("scores src changes higher than config-only changes", () => {
    const srcChange = makeGitDiff([
      { from: "src/core.ts", to: "src/core.ts", lines: ["+export const core = 1;", "-export const core = 0;"] },
    ]);
    const configChange = makeGitDiff([
      { from: "package.json", to: "package.json", lines: ['+"type": "module"', '-"type": "commonjs"'] },
    ]);

    expect(riskScore(srcChange)).toBeGreaterThan(riskScore(configChange));
  });

  it("keeps score within 0-100", () => {
    const huge = makeGitDiff([
      {
        from: "src/huge.ts",
        to: "src/huge.ts",
        lines: Array.from({ length: 1000 }, (_, i) => `+const n${i} = ${i};`),
      },
      {
        from: "package.json",
        to: "package.json",
        lines: Array.from({ length: 300 }, (_, i) => `+"k${i}": ${i},`),
      },
    ]);

    const score = riskScore(huge);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});
