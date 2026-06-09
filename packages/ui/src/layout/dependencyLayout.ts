import type {
  GraphEdge,
  GraphNode,
  LayoutedGraph,
  LayoutedGraphNode,
} from "../graphTypes";
import {
  fallbackGridLayout,
  NODE_HEIGHT,
  NODE_WIDTH,
  toLayoutedEdge,
  toLayoutedNode,
} from "./shared";

type ElkPort = {
  id: string;
  layoutOptions: Record<string, string>;
};

type ElkEdge = {
  id: string;
  sources: string[];
  targets: string[];
};

type ElkNode = {
  id: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  layoutOptions?: Record<string, string>;
  ports?: ElkPort[];
  children?: ElkNode[];
  edges?: ElkEdge[];
};

async function layoutWithElk(elkGraph: ElkNode): Promise<ElkNode> {
  const { default: ELK } = await import("elkjs/lib/elk.bundled.js");
  const elk = new ELK();
  return elk.layout(elkGraph) as Promise<ElkNode>;
}

function toElkGraph(nodes: GraphNode[], edges: GraphEdge[]): ElkNode {
  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.layered.spacing.nodeNodeBetweenLayers": "100",
      "elk.spacing.nodeNode": "40",
      "elk.edgeRouting": "ORTHOGONAL",
    },
    children: nodes.map((node) => ({
      id: node.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      ports: [
        {
          id: `${node.id}-in`,
          layoutOptions: { "org.eclipse.elk.port.side": "WEST" },
        },
        {
          id: `${node.id}-out`,
          layoutOptions: { "org.eclipse.elk.port.side": "EAST" },
        },
      ],
      layoutOptions: {
        "org.eclipse.elk.portConstraints": "FIXED_ORDER",
      },
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [`${edge.source}-out`],
      targets: [`${edge.target}-in`],
    })),
  };
}

export async function layoutDependencyGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
): Promise<LayoutedGraph> {
  let layoutedGraph: ElkNode;

  try {
    layoutedGraph = await layoutWithElk(toElkGraph(nodes, edges));
  } catch (error) {
    console.warn("ELK layout failed. Falling back to a grid layout.", error);
    return fallbackGridLayout(nodes, edges);
  }

  const layoutedNodeById = new Map(
    layoutedGraph.children?.map((node) => [node.id, node]) ?? [],
  );

  const layoutedNodes: LayoutedGraphNode[] = nodes.map((node) => {
    const elkNode = layoutedNodeById.get(node.id);
    return toLayoutedNode(node, {
      x: elkNode?.x ?? 0,
      y: elkNode?.y ?? 0,
    });
  });

  return {
    nodes: layoutedNodes,
    edges: edges.map(toLayoutedEdge),
  };
}
