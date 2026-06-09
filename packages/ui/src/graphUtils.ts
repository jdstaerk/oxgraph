import type { AnalysisMode } from "./appTypes";
import type { GraphPayload, GraphResponse, LayoutedGraph } from "./graphTypes";
import { compactPath } from "./nodeDisplay";

export type GraphStartPoint = {
  detail: string;
  id: string;
  label: string;
  scoreLabel: string;
};

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

export function filterGraphByGhostVisibility(
  graph: LayoutedGraph,
  showGhostNodes: boolean,
): LayoutedGraph {
  if (showGhostNodes) {
    return graph;
  }

  const visibleNodes = graph.nodes.filter((node) => node.data.kind !== "ghost");
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = graph.edges.filter(
    (edge) =>
      visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target),
  );

  return { nodes: visibleNodes, edges: visibleEdges };
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop()?.toLowerCase() ?? path.toLowerCase();
}

function isDependencyEntryCandidate(
  node: LayoutedGraph["nodes"][number],
): boolean {
  const path = node.data.path.toLowerCase();
  const name = fileName(node.data.path);

  return (
    node.data.isEntry ||
    name === "main.tsx" ||
    name === "main.ts" ||
    name === "app.tsx" ||
    name === "app.ts" ||
    name === "index.tsx" ||
    name === "index.ts" ||
    name === "page.tsx" ||
    name === "layout.tsx" ||
    name === "route.ts" ||
    path.includes("/src/") ||
    path.includes("\\src\\")
  );
}

function isCallEntryCandidate(node: LayoutedGraph["nodes"][number]): boolean {
  const name = node.data.name ?? node.data.label;
  const file = node.data.file ?? node.data.path;
  const fileBaseName = fileName(file);

  return (
    /Page$|Layout$/.test(name) ||
    /^(GET|POST|PUT|PATCH|DELETE)$/.test(name) ||
    fileBaseName === "page.tsx" ||
    fileBaseName === "layout.tsx" ||
    fileBaseName === "route.ts"
  );
}

export function getGraphStartPoints(
  graph: LayoutedGraph,
  analysisMode: AnalysisMode,
  limit = 8,
): GraphStartPoint[] {
  const incomingCount = new Map<string, number>();
  const outgoingCount = new Map<string, number>();

  for (const edge of graph.edges) {
    outgoingCount.set(edge.source, (outgoingCount.get(edge.source) ?? 0) + 1);
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
  }

  return graph.nodes
    .map((node) => {
      const incoming = incomingCount.get(node.id) ?? 0;
      const outgoing = outgoingCount.get(node.id) ?? 0;
      const isEntryCandidate =
        analysisMode === "call"
          ? isCallEntryCandidate(node)
          : isDependencyEntryCandidate(node);
      const rootBonus = incoming === 0 ? 12 : 0;
      const entryBonus = isEntryCandidate ? 24 : 0;
      const score = entryBonus + rootBonus + outgoing * 3 - incoming;

      return {
        detail: compactPath(node.data.file ?? node.data.path),
        id: node.id,
        label: node.data.label,
        score,
        scoreLabel:
          analysisMode === "call"
            ? `${incoming} in · ${outgoing} out`
            : `${outgoing} imports`,
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.label.localeCompare(right.label) ||
        left.id.localeCompare(right.id),
    )
    .slice(0, limit)
    .map(({ score: _score, ...candidate }) => candidate);
}

function collectFocusedNodeIds(
  startNodeId: string,
  edges: LayoutedGraph["edges"],
  maxDepth: number,
) {
  const relatedNodeIds = new Set<string>([startNodeId]);
  let outgoingQueue = [startNodeId];
  let incomingQueue = [startNodeId];

  let currentDepth = 0;

  while (currentDepth < maxDepth && (outgoingQueue.length > 0 || incomingQueue.length > 0)) {
    const nextOutgoing: string[] = [];
    for (const currentNodeId of outgoingQueue) {
      for (const edge of edges) {
        if (edge.source === currentNodeId && !relatedNodeIds.has(edge.target)) {
          relatedNodeIds.add(edge.target);
          nextOutgoing.push(edge.target);
        }
      }
    }

    const nextIncoming: string[] = [];
    for (const currentNodeId of incomingQueue) {
      for (const edge of edges) {
        if (edge.target === currentNodeId && !relatedNodeIds.has(edge.source)) {
          relatedNodeIds.add(edge.source);
          nextIncoming.push(edge.source);
        }
      }
    }

    outgoingQueue = nextOutgoing;
    incomingQueue = nextIncoming;
    currentDepth++;
  }

  return relatedNodeIds;
}

export function filterGraphByFocus(
  graph: LayoutedGraph,
  focusedNodeId: string | null,
  focusDepth: number = 999,
): LayoutedGraph {
  if (!focusedNodeId) {
    return graph;
  }

  const relatedNodeIds = collectFocusedNodeIds(focusedNodeId, graph.edges, focusDepth);
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
