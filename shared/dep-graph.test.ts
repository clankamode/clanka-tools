import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildDependencyGraph,
  formatDepGraphWriteMessages,
} from "../scripts/dep-graph.mjs";

describe("buildDependencyGraph", () => {
  it("returns a non-empty list of nodes for the repository graph", async () => {
    const graph = await buildDependencyGraph();

    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.nodes.some((node) => node.group === "shared")).toBe(true);
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
