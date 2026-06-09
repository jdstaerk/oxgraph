import { Position } from "reactflow";
import type { AnalysisMode } from "./appTypes";
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
const CALL_GRAPH_X_GAP = 340;
const CALL_GRAPH_Y_GAP = 96;
const CALL_GRAPH_COMPONENT_GAP = 144;
const CALL_GRAPH_ROW_WIDTH = 2400;

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

function isRenderableEdge(edge: GraphEdge, nodeIds: Set<string>): boolean {
  return (
    edge.source !== edge.target &&
    nodeIds.has(edge.source) &&
    nodeIds.has(edge.target)
  );
}

function fileNameFromId(id: string): string {
  return id.split(/[\\/]/).pop() || id;
}

function normalizeNodeData(node: GraphNode): GraphNodeData {
  const path = node.data?.path ?? node.data?.file ?? node.id;

  return {
    label: node.data?.label ?? node.data?.name ?? fileNameFromId(node.id),
    name: node.data?.name,
    path,
    file: node.data?.file,
    kind: node.data?.kind ?? "file",
    status: node.data?.status ?? "resolved",
    isEntry: node.data?.isEntry ?? false,
    spanStart: node.data?.spanStart,
    spanEnd: node.data?.spanEnd,
  };
}

function normalizeEdgeData(edge: GraphEdge): GraphEdgeData {
  return {
    specifier: edge.data?.specifier ?? "",
    calleeName: edge.data?.calleeName,
    kind: edge.data?.kind,
    confidence: edge.data?.confidence,
    isCircular: edge.data?.isCircular ?? false,
    unresolved: edge.data?.unresolved ?? false,
  };
}

async function layoutWithElk(elkGraph: ElkNode): Promise<ElkNode> {
  const { default: ELK } = await import("elkjs/lib/elk.bundled.js");
  const elk = new ELK();
  return elk.layout(elkGraph) as Promise<ElkNode>;
}

function toLayoutedNode(
  node: GraphNode,
  position: { x: number; y: number },
): LayoutedGraphNode {
  return {
    id: node.id,
    type: "custom",
    data: normalizeNodeData(node),
    position,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  };
}

function toLayoutedEdge(edge: GraphEdge): LayoutedGraphEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    data: normalizeEdgeData(edge),
    type: edge.type ?? "smoothstep",
    sourceHandle: "out",
    targetHandle: "in",
    animated: edge.animated ?? false,
  };
}

function fallbackLayout(nodes: GraphNode[], edges: GraphEdge[]): LayoutedGraph {
  const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
  const xGap = NODE_WIDTH + 96;
  const yGap = NODE_HEIGHT + 48;

  return {
    nodes: nodes.map((node, index) =>
      toLayoutedNode(node, {
        x: (index % columns) * xGap,
        y: Math.floor(index / columns) * yGap,
      }),
    ),
    edges: edges.map(toLayoutedEdge),
  };
}

function nodeLabel(node: GraphNode): string {
  return normalizeNodeData(node).label.toLowerCase();
}

function sortedNodeIds(ids: string[], nodeById: Map<string, GraphNode>): string[] {
  return [...ids].sort((left, right) => {
    return compareNodeIds(left, right, nodeById);
  });
}

function compareNodeIds(
  left: string,
  right: string,
  nodeById: Map<string, GraphNode>,
): number {
  const leftNode = nodeById.get(left);
  const rightNode = nodeById.get(right);
  const leftLabel = leftNode ? nodeLabel(leftNode) : left;
  const rightLabel = rightNode ? nodeLabel(rightNode) : right;
  return leftLabel.localeCompare(rightLabel) || left.localeCompare(right);
}

function pushToMapList(map: Map<string, string[]>, key: string, value: string) {
  const values = map.get(key);
  if (values) {
    values.push(value);
    return;
  }

  map.set(key, [value]);
}

function buildCallGraphIndexes(nodes: GraphNode[], edges: GraphEdge[]) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const incomingById = new Map<string, string[]>();
  const outgoingById = new Map<string, string[]>();
  const relatedById = new Map<string, string[]>(
    nodes.map((node) => [node.id, []]),
  );

  for (const edge of edges) {
    pushToMapList(outgoingById, edge.source, edge.target);
    pushToMapList(incomingById, edge.target, edge.source);
    relatedById.get(edge.source)?.push(edge.target);
    relatedById.get(edge.target)?.push(edge.source);
  }

  return { nodeById, incomingById, outgoingById, relatedById };
}

function collectCallGraphComponents(
  nodes: GraphNode[],
  relatedById: Map<string, string[]>,
): string[][] {
  const visited = new Set<string>();
  const components: string[][] = [];

  for (const node of nodes) {
    if (visited.has(node.id)) {
      continue;
    }

    const component: string[] = [];
    const queue = [node.id];
    visited.add(node.id);

    while (queue.length > 0) {
      const currentId = queue.shift();
      if (!currentId) {
        continue;
      }

      component.push(currentId);

      for (const relatedId of relatedById.get(currentId) ?? []) {
        if (visited.has(relatedId)) {
          continue;
        }

        visited.add(relatedId);
        queue.push(relatedId);
      }
    }

    components.push(component);
  }

  return components;
}

function chooseCallGraphRoots(
  component: string[],
  incomingById: Map<string, string[]>,
  outgoingById: Map<string, string[]>,
  nodeById: Map<string, GraphNode>,
): string[] {
  const componentIds = new Set(component);
  const roots = component.filter((id) =>
    (incomingById.get(id) ?? []).every((sourceId) => !componentIds.has(sourceId)),
  );

  if (roots.length > 0) {
    return sortedNodeIds(roots, nodeById);
  }

  const bestRoot = [...component].sort((left, right) => {
    const leftOut = outgoingById.get(left)?.length ?? 0;
    const rightOut = outgoingById.get(right)?.length ?? 0;
    const leftIn = incomingById.get(left)?.length ?? 0;
    const rightIn = incomingById.get(right)?.length ?? 0;
    return (
      rightOut - leftOut ||
      leftIn - rightIn ||
      compareNodeIds(left, right, nodeById)
    );
  })[0];

  return bestRoot ? [bestRoot] : [];
}

function rankCallGraphComponent(
  component: string[],
  roots: string[],
  outgoingById: Map<string, string[]>,
): Map<string, number> {
  const componentIds = new Set(component);
  const rankById = new Map<string, number>();
  const queue: string[] = [];

  for (const root of roots) {
    rankById.set(root, 0);
    queue.push(root);
  }

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) {
      continue;
    }

    const currentRank = rankById.get(currentId) ?? 0;
    for (const targetId of outgoingById.get(currentId) ?? []) {
      if (!componentIds.has(targetId)) {
        continue;
      }

      const nextRank = currentRank + 1;
      const knownRank = rankById.get(targetId);
      if (knownRank !== undefined && knownRank <= nextRank) {
        continue;
      }

      rankById.set(targetId, nextRank);
      queue.push(targetId);
    }
  }

  for (const id of component) {
    if (!rankById.has(id)) {
      rankById.set(id, 0);
    }
  }

  return rankById;
}

type ComponentLayout = {
  height: number;
  positions: Map<string, { x: number; y: number }>;
  width: number;
};

function layoutCallGraphComponent(
  component: string[],
  incomingById: Map<string, string[]>,
  outgoingById: Map<string, string[]>,
  nodeById: Map<string, GraphNode>,
): ComponentLayout {
  const roots = chooseCallGraphRoots(
    component,
    incomingById,
    outgoingById,
    nodeById,
  );
  const rankById = rankCallGraphComponent(component, roots, outgoingById);
  const idsByRank = new Map<string, string[]>();

  for (const id of component) {
    const rank = rankById.get(id) ?? 0;
    pushToMapList(idsByRank, String(rank), id);
  }

  const numericRanks = [...idsByRank.keys()]
    .map(Number)
    .sort((left, right) => left - right);
  const maxRows = Math.max(
    1,
    ...numericRanks.map((rank) => idsByRank.get(String(rank))?.length ?? 0),
  );
  const componentHeight = maxRows * CALL_GRAPH_Y_GAP + NODE_HEIGHT;
  const maxRank = Math.max(0, ...numericRanks);
  const componentWidth = maxRank * CALL_GRAPH_X_GAP + NODE_WIDTH;
  const positions = new Map<string, { x: number; y: number }>();

  for (const rank of numericRanks) {
    const ids = sortedNodeIds(idsByRank.get(String(rank)) ?? [], nodeById);
    const columnY = Math.max(
      0,
      (componentHeight - ids.length * CALL_GRAPH_Y_GAP) / 2,
    );

    ids.forEach((id, index) => {
      positions.set(id, {
        x: rank * CALL_GRAPH_X_GAP,
        y: columnY + index * CALL_GRAPH_Y_GAP,
      });
    });
  }

  return {
    height: componentHeight,
    positions,
    width: componentWidth,
  };
}

function layoutCallGraph(nodes: GraphNode[], edges: GraphEdge[]): LayoutedGraph {
  const { nodeById, incomingById, outgoingById, relatedById } =
    buildCallGraphIndexes(nodes, edges);
  const components = collectCallGraphComponents(nodes, relatedById).sort(
    (left, right) =>
      right.length - left.length ||
      sortedNodeIds(left, nodeById)[0].localeCompare(
        sortedNodeIds(right, nodeById)[0],
      ),
  );
  const positionById = new Map<string, { x: number; y: number }>();
  let xOffset = 0;
  let yOffset = 0;
  let rowHeight = 0;

  for (const component of components) {
    const componentLayout = layoutCallGraphComponent(
      component,
      incomingById,
      outgoingById,
      nodeById,
    );

    if (xOffset > 0 && xOffset + componentLayout.width > CALL_GRAPH_ROW_WIDTH) {
      xOffset = 0;
      yOffset += rowHeight + CALL_GRAPH_COMPONENT_GAP;
      rowHeight = 0;
    }

    for (const [id, position] of componentLayout.positions) {
      positionById.set(id, {
        x: xOffset + position.x,
        y: yOffset + position.y,
      });
    }

    xOffset += componentLayout.width + CALL_GRAPH_COMPONENT_GAP;
    rowHeight = Math.max(rowHeight, componentLayout.height);
  }

  return {
    nodes: nodes.map((node) =>
      toLayoutedNode(node, positionById.get(node.id) ?? { x: 0, y: yOffset }),
    ),
    edges: edges.map(toLayoutedEdge),
  };
}

export async function getLayoutedElements(
  nodes: GraphNode[],
  edges: GraphEdge[],
  analysisMode: AnalysisMode = "dependency",
): Promise<LayoutedGraph> {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const renderableEdges = edges.filter((edge) =>
    isRenderableEdge(edge, nodeIds),
  );

  if (analysisMode === "call") {
    return layoutCallGraph(nodes, renderableEdges);
  }

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
    edges: renderableEdges.map((edge) => ({
      id: edge.id,
      sources: [`${edge.source}-out`],
      targets: [`${edge.target}-in`],
    })),
  };

  let layoutedGraph: ElkNode;
  try {
    layoutedGraph = await layoutWithElk(elkGraph);
  } catch (error) {
    console.warn("ELK layout failed. Falling back to a grid layout.", error);
    return fallbackLayout(nodes, renderableEdges);
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

  const layoutedEdges: LayoutedGraphEdge[] = renderableEdges.map(toLayoutedEdge);

  return { nodes: layoutedNodes, edges: layoutedEdges };
}
