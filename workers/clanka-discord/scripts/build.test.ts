import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const workerRoot = path.resolve(here, "..");
const distRoot = path.join(workerRoot, "dist");

describe("clanka-discord worker build honesty", () => {
  it("vendors healthz into dist and rewrites the index import", () => {
    execFileSync(process.execPath, [path.join(here, "build.mjs")], {
      cwd: workerRoot,
      stdio: "pipe",
    });

    expect(existsSync(path.join(distRoot, "shared/healthz.ts"))).toBe(true);
    expect(existsSync(path.join(distRoot, "shared/shield.ts"))).toBe(true);
    expect(existsSync(path.join(distRoot, "shared/spine.ts"))).toBe(true);

    const index = readFileSync(path.join(distRoot, "index.ts"), "utf8");
    expect(index).toContain("./shared/healthz");
    expect(index).not.toContain("../../../shared/healthz");
  });
});
