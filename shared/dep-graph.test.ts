import { describe, expect, it } from "vitest";
import { buildDependencyGraph } from "../scripts/dep-graph.mjs";

describe("buildDependencyGraph", () => {
  it("returns a non-empty list of nodes for the repository graph", async () => {
    const graph = await buildDependencyGraph();

    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.nodes.some((node) => node.group === "shared")).toBe(true);
  });
});
