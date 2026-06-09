import { describe, expect, it } from "vitest";
import { filterGraphByGhostVisibility } from "./graphUtils";
import type { LayoutedGraph } from "./graphTypes";

describe("graph utilities", () => {
  it("hides ghost nodes and their edges", () => {
    const graph: LayoutedGraph = {
      nodes: [
        {
          id: "resolved",
          position: { x: 0, y: 0 },
          data: {
            label: "resolved",
            path: "/resolved.ts",
            kind: "file",
            status: "resolved",
            isEntry: false,
          },
        },
        {
          id: "ghost",
          position: { x: 100, y: 0 },
          data: {
            label: "ghost",
            path: "/missing.ts",
            kind: "ghost",
            status: "unresolved",
            isEntry: false,
          },
        },
      ],
      edges: [
        {
          id: "resolved-ghost",
          source: "resolved",
          target: "ghost",
          data: { unresolved: true },
        },
      ],
    };

    const result = filterGraphByGhostVisibility(graph, false);

    expect(result.nodes.map((node) => node.id)).toEqual(["resolved"]);
    expect(result.edges).toEqual([]);
  });
});
