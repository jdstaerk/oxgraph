import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import ReactFlow, {
  Background,
  Controls,
  useEdgesState,
  useNodesState,
  type NodeMouseHandler,
  type NodeTypes,
  type ReactFlowInstance,
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
import {
  applySearchHighlights,
  emptyGraph,
  emptyLayoutedGraph,
  filterGraphByFocus,
  matchesSearchQuery,
  normalizeGraphResponse,
  normalizeSearchQuery,
} from "./graphUtils";
import { getLayoutedElements } from "./layout";

type AnalysisMode = "dependency" | "call";
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
  flexWrap: "wrap",
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

function modeButtonStyle(isActive: boolean): CSSProperties {
  return {
    ...buttonStyleBase,
    background: isActive ? "#1d4ed8" : "#0f172a",
  };
}

async function graphResponseErrorMessage(response: Response): Promise<string> {
  const fallback = `Failed to load graph data (${response.status} ${response.statusText})`;
  const contentType = response.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      const body = (await response.json()) as { error?: unknown };
      return typeof body.error === "string" && body.error.trim()
        ? body.error
        : fallback;
    }

    const text = await response.text();
    return text.trim() ? `${fallback}: ${text.trim()}` : fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null);
  const [analysisMode, setAnalysisMode] =
    useState<AnalysisMode>("dependency");
  const [mode, setMode] = useState<GraphMode>("graph");
  const [graph, setGraph] = useState<GraphPayload>(emptyGraph);
  const [layoutedGraph, setLayoutedGraph] =
    useState<LayoutedGraph>(emptyLayoutedGraph);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [callEntryFunction, setCallEntryFunction] = useState("");
  const [activeCallEntryFunction, setActiveCallEntryFunction] = useState("");
  const [metrics, setMetrics] = useState<GraphMetrics | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState<GraphNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<GraphEdgeData>([]);
  const normalizedSearchQuery = useMemo(
    () => normalizeSearchQuery(searchQuery),
    [searchQuery],
  );
  const graphEndpoint = useMemo(() => {
    if (analysisMode === "dependency") {
      return "/api/graph-data";
    }

    if (activeCallEntryFunction) {
      return `/api/call-graph-data?entryFunction=${encodeURIComponent(
        activeCallEntryFunction,
      )}`;
    }

    return "/api/call-graph-data";
  }, [activeCallEntryFunction, analysisMode]);

  useEffect(() => {
    let isActive = true;
    const fetchStartedAt = performance.now();

    setIsLoading(true);
    setLoadError(null);
    setMetrics(null);
    setFocusedNodeId(null);
    setGraph(emptyGraph());
    setLayoutedGraph(emptyLayoutedGraph());

    const fetchGraph = async () => {
      try {
        const response = await fetch(graphEndpoint);
        if (!response.ok) {
          throw new Error(await graphResponseErrorMessage(response));
        }

        const responseBody = (await response.json()) as GraphResponse;
        const fetchFinishedAt = performance.now();
        const graphPayload = normalizeGraphResponse(responseBody);
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
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if (isActive) {
          setLoadError(message);
        }
        console.error(error);
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    void fetchGraph();

    return () => {
      isActive = false;
    };
  }, [graphEndpoint]);

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

  useEffect(() => {
    if (mode !== "graph" || nodes.length === 0) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      reactFlowInstanceRef.current?.fitView({ padding: 0.2, duration: 180 });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [edges.length, mode, nodes.length]);

  const handleNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    setFocusedNodeId(node.id);
  }, []);

  const clearFocus = useCallback(() => {
    setFocusedNodeId(null);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      if (event.key === "Escape") {
        clearFocus();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [clearFocus]);

  const selectAnalysisMode = useCallback((nextMode: AnalysisMode) => {
    setAnalysisMode(nextMode);
    setMode("graph");
    setFocusedNodeId(null);
    setSearchQuery("");
  }, []);

  const handleCallGraphSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const normalizedFunction = callEntryFunction.trim();
      setActiveCallEntryFunction(normalizedFunction);
      setFocusedNodeId(null);
      setSearchQuery("");
      setMode("graph");
    },
    [callEntryFunction],
  );

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
  const statsLabel = `${analysisMode === "call" ? "call graph" : "dependencies"} · ${nodes.length}/${graph.nodes.length} nodes · ${edges.length}/${graph.edges.length} edges · ${graph.issues.length} issues`;
  const headerStatusLabel = isLoading ? `${statsLabel} · loading` : statsLabel;
  const searchPlaceholder =
    analysisMode === "call" ? "Search functions..." : "Search files...";

  return (
    <div style={appStyle}>
      <div style={headerStyle}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>oxgraph</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => selectAnalysisMode("dependency")}
            style={modeButtonStyle(analysisMode === "dependency")}
          >
            Dependencies
          </button>
          <button
            type="button"
            onClick={() => selectAnalysisMode("call")}
            style={modeButtonStyle(analysisMode === "call")}
          >
            Call Graph
          </button>
        </div>
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
        {analysisMode === "call" ? (
          <form
            onSubmit={handleCallGraphSubmit}
            style={{ display: "flex", gap: 8, alignItems: "center" }}
          >
            <input
              aria-label="Function name"
              type="search"
              placeholder="Function name..."
              value={callEntryFunction}
              onChange={(event) => setCallEntryFunction(event.target.value)}
              style={{
                width: 220,
                height: 32,
                border: "1px solid #334155",
                borderRadius: 6,
                background: "#0f172a",
                color: "#e2e8f0",
                padding: "0 10px",
                outline: "none",
              }}
            />
            <button
              type="submit"
              style={{ ...buttonStyleBase, background: "#0f172a" }}
            >
              Analyze
            </button>
          </form>
        ) : null}
        <SearchBox
          inputRef={searchInputRef}
          query={searchQuery}
          placeholder={searchPlaceholder}
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
        <div
          style={{
            marginLeft: "auto",
            minWidth: 180,
            fontSize: 12,
            color: "#94a3b8",
            textAlign: "right",
          }}
        >
          {headerStatusLabel}
          {metricsLabel}
          {loadError ? ` · ${loadError}` : ""}
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
            onInit={(instance) => {
              reactFlowInstanceRef.current = instance;
            }}
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
