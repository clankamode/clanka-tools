import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildDependencyGraph,
  formatDepGraphWriteMessages,
  parseDepGraphCli,
  runDepGraphCli,
  usageText,
} from "../scripts/dep-graph.mjs";

describe("buildDependencyGraph", () => {
  it("returns a non-empty list of nodes for the repository graph", async () => {
    const graph = await buildDependencyGraph();

    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.nodes.some((node) => node.group === "shared")).toBe(true);
  });

  it("includes Discord command handlers and their shield/spine edges", async () => {
    const graph = await buildDependencyGraph();
    const ids = new Set(graph.nodes.map((node) => node.id));

    expect(ids.has("workers/clanka-discord/commands/registry")).toBe(true);
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        {
          from: "workers/clanka-discord/src/index",
          to: "workers/clanka-discord/commands/registry",
        },
        { from: "workers/clanka-discord/commands/registry", to: "shared/shield" },
        { from: "workers/clanka-discord/commands/registry", to: "shared/spine" },
      ]),
    );
  });
});

describe("dep-graph CLI honesty", () => {
  it("prints help without writing graph files", async () => {
    const parsed = parseDepGraphCli(["--help"]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      throw new Error("expected --help to parse");
    }
    expect(parsed.help).toBe(true);
    expect(usageText()).toMatch(/without writing docs\/dep-graph\.dot/);

    const write = vi.fn();
    const log = vi.fn();
    const result = await runDepGraphCli(["--help"], { write, log, errorLog: vi.fn() });

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ help: true });
    expect(write).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(usageText());
  });

  it("fails loudly on unknown flags rather than writing a graph", async () => {
    const parsed = parseDepGraphCli(["--pretty"]);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) {
      throw new Error("expected unknown flags to fail");
    }
    expect(parsed.error).toMatch(/Unknown flag: --pretty/);

    const write = vi.fn();
    const errorLog = vi.fn();
    const result = await runDepGraphCli(["--pretty"], {
      write,
      log: vi.fn(),
      errorLog,
    });

    expect(result.ok).toBe(false);
    expect(write).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining("Unknown flag: --pretty"));
  });
});

describe("formatDepGraphWriteMessages", () => {
  const rootDir = "/repo";

  it("reports both outputs when SVG rendering succeeded", () => {
    expect(
      formatDepGraphWriteMessages({
        rootDir,
        dotPath: path.join(rootDir, "docs/dep-graph.dot"),
        svgPath: path.join(rootDir, "docs/dep-graph.svg"),
      }),
    ).toEqual(["Wrote docs/dep-graph.dot", "Wrote docs/dep-graph.svg"]);
  });

  it("reports an explicit skip when Graphviz is unavailable", () => {
    const messages = formatDepGraphWriteMessages({
      rootDir,
      dotPath: path.join(rootDir, "docs/dep-graph.dot"),
      svgPath: null,
    });

    expect(messages[0]).toBe("Wrote docs/dep-graph.dot");
    expect(messages[1]).toContain("Skipped docs/dep-graph.svg");
    expect(messages[1]).toContain("Graphviz");
  });
});
