import { Position } from "reactflow";
import type {
  GraphEdge,
  GraphEdgeData,
  GraphNode,
  GraphNodeData,
  LayoutedGraph,
  LayoutedGraphEdge,
  LayoutedGraphNode,
} from "../graphTypes";

export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 64;

export function isRenderableEdge(
  edge: GraphEdge,
  nodeIds: Set<string>,
): boolean {
  return (
    edge.source !== edge.target &&
    nodeIds.has(edge.source) &&
    nodeIds.has(edge.target)
  );
}

function fileNameFromId(id: string): string {
  return id.split(/[\\/]/).pop() || id;
}

export function normalizeNodeData(node: GraphNode): GraphNodeData {
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

export function toLayoutedNode(
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

export function toLayoutedEdge(edge: GraphEdge): LayoutedGraphEdge {
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

export function fallbackGridLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
): LayoutedGraph {
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

export function compareNodeIds(
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

export function sortedNodeIds(
  ids: string[],
  nodeById: Map<string, GraphNode>,
): string[] {
  return [...ids].sort((left, right) =>
    compareNodeIds(left, right, nodeById),
  );
}

export function pushToMapList(
  map: Map<string, string[]>,
  key: string,
  value: string,
) {
  const values = map.get(key);
  if (values) {
    values.push(value);
    return;
  }

  map.set(key, [value]);
}
