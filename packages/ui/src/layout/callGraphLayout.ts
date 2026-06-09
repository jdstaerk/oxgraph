import type { GraphEdge, GraphNode, LayoutedGraph } from "../graphTypes";
import {
  compareNodeIds,
  NODE_HEIGHT,
  NODE_WIDTH,
  pushToMapList,
  sortedNodeIds,
  toLayoutedEdge,
  toLayoutedNode,
} from "./shared";

const CALL_GRAPH_X_GAP = 400;
const CALL_GRAPH_Y_GAP = 96;
const CALL_GRAPH_COMPONENT_GAP = 144;
const CALL_GRAPH_ROW_WIDTH = 2400;

type CallGraphIndexes = {
  incomingById: Map<string, string[]>;
  nodeById: Map<string, GraphNode>;
  outgoingById: Map<string, string[]>;
  relatedById: Map<string, string[]>;
};

type ComponentLayout = {
  height: number;
  positions: Map<string, { x: number; y: number }>;
  width: number;
};

function buildCallGraphIndexes(
  nodes: GraphNode[],
  edges: GraphEdge[],
): CallGraphIndexes {
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

  return { incomingById, nodeById, outgoingById, relatedById };
}

function collectComponents(
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

function chooseComponentRoots(
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

function rankComponent(
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

function layoutComponent(
  component: string[],
  incomingById: Map<string, string[]>,
  outgoingById: Map<string, string[]>,
  nodeById: Map<string, GraphNode>,
): ComponentLayout {
  const roots = chooseComponentRoots(
    component,
    incomingById,
    outgoingById,
    nodeById,
  );
  const rankById = rankComponent(component, roots, outgoingById);
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

export function layoutCallGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
): LayoutedGraph {
  const { incomingById, nodeById, outgoingById, relatedById } =
    buildCallGraphIndexes(nodes, edges);
  const components = collectComponents(nodes, relatedById).sort(
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
    const componentLayout = layoutComponent(
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
