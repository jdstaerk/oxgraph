import type { GraphPayload, GraphResponse, LayoutedGraph } from "./graphTypes";

export function emptyGraph(): GraphPayload {
  return { nodes: [], edges: [], issues: [] };
}

export function emptyLayoutedGraph(): LayoutedGraph {
  return { nodes: [], edges: [] };
}

export function normalizeGraphResponse(response: GraphResponse): GraphPayload {
  return {
    nodes: response.nodes ?? [],
    edges: response.edges ?? [],
    issues: response.issues ?? [],
  };
}

export function normalizeSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

function nodeSearchText(node: LayoutedGraph["nodes"][number]): string {
  return `${node.data.label} ${node.data.name ?? ""} ${node.data.path} ${node.data.file ?? ""} ${node.id}`.toLowerCase();
}

export function matchesSearchQuery(
  node: LayoutedGraph["nodes"][number],
  normalizedQuery: string,
): boolean {
  return normalizedQuery.length > 0 && nodeSearchText(node).includes(normalizedQuery);
}

export function applySearchHighlights(
  graph: LayoutedGraph,
  normalizedQuery: string,
): LayoutedGraph {
  if (!normalizedQuery) {
    return graph;
  }

  return {
    nodes: graph.nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        searchMatch: matchesSearchQuery(node, normalizedQuery),
      },
    })),
    edges: graph.edges,
  };
}

function collectFocusedNodeIds(
  startNodeId: string,
  edges: LayoutedGraph["edges"],
) {
  const relatedNodeIds = new Set<string>([startNodeId]);
  const outgoingQueue = [startNodeId];
  const incomingQueue = [startNodeId];

  while (outgoingQueue.length > 0) {
    const currentNodeId = outgoingQueue.shift();
    if (!currentNodeId) {
      continue;
    }

    for (const edge of edges) {
      if (edge.source !== currentNodeId || relatedNodeIds.has(edge.target)) {
        continue;
      }

      relatedNodeIds.add(edge.target);
      outgoingQueue.push(edge.target);
    }
  }

  while (incomingQueue.length > 0) {
    const currentNodeId = incomingQueue.shift();
    if (!currentNodeId) {
      continue;
    }

    for (const edge of edges) {
      if (edge.target !== currentNodeId || relatedNodeIds.has(edge.source)) {
        continue;
      }

      relatedNodeIds.add(edge.source);
      incomingQueue.push(edge.source);
    }
  }

  return relatedNodeIds;
}

export function filterGraphByFocus(
  graph: LayoutedGraph,
  focusedNodeId: string | null,
): LayoutedGraph {
  if (!focusedNodeId) {
    return graph;
  }

  const relatedNodeIds = collectFocusedNodeIds(focusedNodeId, graph.edges);
  const visibleNodes = graph.nodes
    .filter((node) => relatedNodeIds.has(node.id))
    .map((node) => ({
      ...node,
      data: {
        ...node.data,
        focused: node.id === focusedNodeId,
      },
      selected: node.id === focusedNodeId,
    }));
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = graph.edges.filter(
    (edge) =>
      visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target),
  );

  return { nodes: visibleNodes, edges: visibleEdges };
}
