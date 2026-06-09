import { describe, it, expect, vi } from "vitest";
import { getLayoutedElements } from "./layout";
import type { GraphNode, GraphEdge } from "./graphTypes";

// Mock ELK because it's a heavy dependency and we just want to verify our integration/contract
vi.mock("elkjs/lib/elk.bundled.js", () => {
  return {
    default: class {
      async layout(graph: any) {
        // Simple mock layout: just pass through the nodes with some fixed positions
        return {
          ...graph,
          children: graph.children.map((child: any, index: number) => ({
            ...child,
            x: index * 100,
            y: index * 50,
          })),
        };
      }
    },
  };
});

describe("layouting service", () => {
  it("correctly returns positioned nodes respecting ELK constraints", async () => {
    const nodes: GraphNode[] = [
      { id: "1", data: { label: "Node 1" } },
      { id: "2", data: { label: "Node 2" } },
    ];
    const edges: GraphEdge[] = [
      { id: "e1-2", source: "1", target: "2" },
    ];

    const result = await getLayoutedElements(nodes, edges, "dependency");

    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);

    expect(result.nodes[0].position.x).toBe(0);
    expect(result.nodes[0].position.y).toBe(0);
    expect(result.nodes[1].position.x).toBe(100);
    expect(result.nodes[1].position.y).toBe(50);

    expect(result.nodes[0].data.label).toBe("Node 1");
    expect(result.nodes[0].type).toBe("custom");
    expect(result.edges[0].sourceHandle).toBe("out");
    expect(result.edges[0].targetHandle).toBe("in");
  });

  it("uses a fast call graph layout and skips self-loop edges", async () => {
    const nodes: GraphNode[] = [
      { id: "a", data: { label: "start" } },
      { id: "b", data: { label: "middle" } },
      { id: "c", data: { label: "recursive" } },
    ];
    const edges: GraphEdge[] = [
      { id: "a-b", source: "a", target: "b" },
      { id: "b-c", source: "b", target: "c" },
      { id: "c-c", source: "c", target: "c" },
    ];

    const result = await getLayoutedElements(nodes, edges, "call");

    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(2);
    expect(result.edges.some((edge) => edge.source === edge.target)).toBe(false);
    expect(result.nodes.find((node) => node.id === "a")?.position.x).toBe(0);
    expect(result.nodes.find((node) => node.id === "b")?.position.x).toBe(400);
    expect(result.nodes.find((node) => node.id === "c")?.position.x).toBe(800);
  });
});
