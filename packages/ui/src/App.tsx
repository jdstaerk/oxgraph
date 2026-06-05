import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import ReactFlow, {
  Background,
  Controls,
  useEdgesState,
  useNodesState,
  type NodeMouseHandler,
  type NodeTypes,
} from "reactflow";
import "reactflow/dist/style.css";
import CustomNode from "./CustomNode";
import SearchBox from "./SearchBox";
import type {
  GraphEdgeData,
  GraphNodeData,
  GraphPayload,
  GraphResponse,
  LayoutedGraph,
} from "./graphTypes";
import { getLayoutedElements } from "./layout";

type GraphMode = "graph" | "raw";

type GraphMetrics = {
  fetchMs: number;
  layoutMs: number;
};

const SEARCH_RESULT_LIMIT = 8;

const nodeTypes: NodeTypes = {
  custom: CustomNode,
};

const appStyle: CSSProperties = {
  width: "100vw",
  height: "100vh",
  background: "#0f172a",
  color: "#e2e8f0",
  display: "flex",
  flexDirection: "column",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 16px",
  borderBottom: "1px solid #1e293b",
  background: "#0b1220",
  flex: "0 0 auto",
};

const buttonStyleBase: CSSProperties = {
  border: "1px solid #334155",
  color: "#e2e8f0",
  padding: "6px 10px",
  borderRadius: 6,
  cursor: "pointer",
};

const rawJsonStyle: CSSProperties = {
  margin: 0,
  width: "100%",
  height: "100%",
  overflow: "auto",
  padding: 16,
  fontSize: 12,
  lineHeight: 1.6,
  background: "#0b1220",
  color: "#cbd5e1",
  whiteSpace: "pre",
};

function emptyGraph(): GraphPayload {
  return { nodes: [], edges: [], issues: [] };
}

function emptyLayoutedGraph(): LayoutedGraph {
  return { nodes: [], edges: [] };
}

function normalizeGraphResponse(response: GraphResponse): GraphPayload {
  return {
    nodes: response.nodes ?? [],
    edges: response.edges ?? [],
    issues: response.issues ?? [],
  };
}

function modeButtonStyle(isActive: boolean): CSSProperties {
  return {
    ...buttonStyleBase,
    background: isActive ? "#1d4ed8" : "#0f172a",
  };
}

function normalizeSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

function nodeSearchText(node: LayoutedGraph["nodes"][number]): string {
  return `${node.data.label} ${node.data.path} ${node.id}`.toLowerCase();
}

function matchesSearchQuery(
  node: LayoutedGraph["nodes"][number],
  normalizedQuery: string,
): boolean {
  return normalizedQuery.length > 0 && nodeSearchText(node).includes(normalizedQuery);
}

function applySearchHighlights(
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
  const importerQueue = [startNodeId];

  for (const edge of edges) {
    if (edge.source === startNodeId) {
      relatedNodeIds.add(edge.target);
    }
  }

  while (importerQueue.length > 0) {
    const currentNodeId = importerQueue.shift();
    if (!currentNodeId) {
      continue;
    }

    for (const edge of edges) {
      if (edge.target !== currentNodeId || relatedNodeIds.has(edge.source)) {
        continue;
      }

      relatedNodeIds.add(edge.source);
      importerQueue.push(edge.source);
    }
  }

  return relatedNodeIds;
}

function filterGraphByFocus(
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

export default function App() {
  const [mode, setMode] = useState<GraphMode>("graph");
  const [graph, setGraph] = useState<GraphPayload>(emptyGraph);
  const [layoutedGraph, setLayoutedGraph] =
    useState<LayoutedGraph>(emptyLayoutedGraph);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [metrics, setMetrics] = useState<GraphMetrics | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<GraphNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<GraphEdgeData>([]);
  const normalizedSearchQuery = useMemo(
    () => normalizeSearchQuery(searchQuery),
    [searchQuery],
  );

  useEffect(() => {
    let isActive = true;
    const fetchStartedAt = performance.now();

    fetch("/api/graph-data")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to load graph data.");
        }
        return response.json() as Promise<GraphResponse>;
      })
      .then(async (response) => {
        const fetchFinishedAt = performance.now();
        const graphPayload = normalizeGraphResponse(response);
        const layoutStartedAt = performance.now();
        const layoutedElements = await getLayoutedElements(
          graphPayload.nodes,
          graphPayload.edges,
        );
        const layoutFinishedAt = performance.now();

        if (!isActive) {
          return;
        }

        setGraph(graphPayload);
        setFocusedNodeId(null);
        setLayoutedGraph(layoutedElements);
        setMetrics({
          fetchMs: fetchFinishedAt - fetchStartedAt,
          layoutMs: layoutFinishedAt - layoutStartedAt,
        });
      })
      .catch((error: unknown) => console.error(error));

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    const visibleGraph = applySearchHighlights(
      filterGraphByFocus(layoutedGraph, focusedNodeId),
      normalizedSearchQuery,
    );
    setNodes(visibleGraph.nodes);
    setEdges(visibleGraph.edges);
  }, [
    focusedNodeId,
    layoutedGraph,
    normalizedSearchQuery,
    setEdges,
    setNodes,
  ]);

  const handleNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    setFocusedNodeId(node.id);
  }, []);

  const clearFocus = useCallback(() => {
    setFocusedNodeId(null);
  }, []);

  const searchMatches = useMemo(() => {
    if (!normalizedSearchQuery) {
      return [];
    }

    return layoutedGraph.nodes.filter((node) =>
      matchesSearchQuery(node, normalizedSearchQuery),
    );
  }, [layoutedGraph.nodes, normalizedSearchQuery]);
  const searchResults = searchMatches.slice(0, SEARCH_RESULT_LIMIT);
  const searchResultCount = searchMatches.length;

  const selectSearchResult = useCallback((nodeId: string) => {
    setFocusedNodeId(nodeId);
    setMode("graph");
  }, []);

  const clearSearch = useCallback(() => {
    setSearchQuery("");
  }, []);

  const rawJson = useMemo(() => JSON.stringify(graph, null, 2), [graph]);
  const focusedLabel = useMemo(() => {
    if (!focusedNodeId) {
      return null;
    }

    const focusedNode = layoutedGraph.nodes.find(
      (node) => node.id === focusedNodeId,
    );
    return focusedNode?.data.label || focusedNodeId;
  }, [focusedNodeId, layoutedGraph.nodes]);

  const metricsLabel = metrics
    ? ` · fetch ${Math.round(metrics.fetchMs)}ms · layout ${Math.round(metrics.layoutMs)}ms`
    : "";
  const statsLabel = `${nodes.length}/${graph.nodes.length} nodes · ${edges.length}/${graph.edges.length} edges · ${graph.issues.length} issues`;

  return (
    <div style={appStyle}>
      <div style={headerStyle}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>oxgraph</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setMode("graph")}
            style={modeButtonStyle(mode === "graph")}
          >
            Graph
          </button>
          <button
            type="button"
            onClick={() => setMode("raw")}
            style={modeButtonStyle(mode === "raw")}
          >
            Raw JSON
          </button>
        </div>
        <SearchBox
          query={searchQuery}
          results={searchResults}
          resultCount={searchResultCount}
          selectedNodeId={focusedNodeId}
          onQueryChange={setSearchQuery}
          onSelect={selectSearchResult}
          onClear={clearSearch}
        />
        {focusedLabel ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              minWidth: 0,
              fontSize: 12,
              color: "#cbd5e1",
            }}
          >
            <span
              style={{
                maxWidth: 280,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              Focus: {focusedLabel}
            </span>
            <button
              type="button"
              onClick={clearFocus}
              style={{ ...buttonStyleBase, background: "#0f172a" }}
            >
              All
            </button>
          </div>
        ) : null}
        <div style={{ marginLeft: "auto", fontSize: 12, color: "#94a3b8" }}>
          {statsLabel}
          {metricsLabel}
        </div>
      </div>

      <div style={{ flex: "1 1 auto", minHeight: 0 }}>
        {mode === "graph" ? (
          <ReactFlow
            key={focusedNodeId ?? "all"}
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={handleNodeClick}
            onPaneClick={clearFocus}
            nodeTypes={nodeTypes}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#334155" gap={16} />
            <Controls />
          </ReactFlow>
        ) : (
          <pre style={rawJsonStyle}>{rawJson}</pre>
        )}
      </div>
    </div>
  );
}
