import { Position } from "reactflow";
import type {
  GraphEdge,
  GraphEdgeData,
  GraphNode,
  GraphNodeData,
  LayoutedGraph,
  LayoutedGraphEdge,
  LayoutedGraphNode,
} from "./graphTypes";

const NODE_WIDTH = 200;
const NODE_HEIGHT = 50;

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

function fileNameFromId(id: string): string {
  return id.split(/[\\/]/).pop() || id;
}

function normalizeNodeData(node: GraphNode): GraphNodeData {
  return {
    label: node.data?.label ?? fileNameFromId(node.id),
    path: node.data?.path ?? node.id,
    kind: node.data?.kind ?? "file",
    status: node.data?.status ?? "resolved",
    isEntry: node.data?.isEntry ?? false,
  };
}

function normalizeEdgeData(edge: GraphEdge): GraphEdgeData {
  return {
    specifier: edge.data?.specifier ?? "",
    isCircular: edge.data?.isCircular ?? false,
    unresolved: edge.data?.unresolved ?? false,
  };
}

async function layoutWithElk(elkGraph: ElkNode): Promise<ElkNode> {
  const { default: ELK } = await import("elkjs/lib/elk.bundled.js");
  const elk = new ELK();
  return elk.layout(elkGraph) as Promise<ElkNode>;
}

export async function getLayoutedElements(
  nodes: GraphNode[],
  edges: GraphEdge[],
): Promise<LayoutedGraph> {
  const elkGraph: ElkNode = {
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

  const layoutedGraph = await layoutWithElk(elkGraph);
  const layoutedNodeById = new Map(
    layoutedGraph.children?.map((node) => [node.id, node]) ?? [],
  );

  const layoutedNodes: LayoutedGraphNode[] = nodes.map((node) => {
    const elkNode = layoutedNodeById.get(node.id);

    return {
      id: node.id,
      type: "custom",
      data: normalizeNodeData(node),
      position: {
        x: elkNode?.x ?? 0,
        y: elkNode?.y ?? 0,
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
  });

  const layoutedEdges: LayoutedGraphEdge[] = edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    data: normalizeEdgeData(edge),
    type: edge.type ?? "smoothstep",
    sourceHandle: "out",
    targetHandle: "in",
    animated: edge.animated ?? false,
  }));

  return { nodes: layoutedNodes, edges: layoutedEdges };
}
