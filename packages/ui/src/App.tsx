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
import type { AnalysisMode, GraphMode } from "./appTypes";
import CustomNode from "./CustomNode";
import GraphCanvasState from "./GraphCanvasState";
import GraphToolbar from "./GraphToolbar";
import IssuesPanel from "./IssuesPanel";
import type { GraphEdgeData, GraphIssue, GraphNodeData } from "./graphTypes";
import {
  applySearchHighlights,
  filterGraphByFocus,
  matchesSearchQuery,
  normalizeSearchQuery,
} from "./graphUtils";
import { useGraphData } from "./useGraphData";
import { useSearchHotkeys } from "./useSearchHotkeys";

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

const graphAreaStyle: CSSProperties = {
  position: "relative",
  flex: "1 1 auto",
  minHeight: 0,
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

function findIssueNodeId(
  issue: GraphIssue,
  nodes: ReturnType<typeof useGraphData>["layoutedGraph"]["nodes"],
): string | null {
  const issueFile = issue.file.toLowerCase();
  const matchingNode = nodes.find((node) => {
    const path = node.data.path?.toLowerCase();
    const file = node.data.file?.toLowerCase();
    return (
      node.id.toLowerCase() === issueFile ||
      path === issueFile ||
      file === issueFile
    );
  });

  return matchingNode?.id ?? null;
}

export default function App() {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null);
  const [analysisMode, setAnalysisMode] =
    useState<AnalysisMode>("dependency");
  const [graphMode, setGraphMode] = useState<GraphMode>("graph");
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [callEntryFunction, setCallEntryFunction] = useState("");
  const [activeCallEntryFunction, setActiveCallEntryFunction] = useState("");
  const [nodes, setNodes, onNodesChange] = useNodesState<GraphNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<GraphEdgeData>([]);
  const { graph, layoutedGraph, metrics, loadError, isLoading } =
    useGraphData({
      analysisMode,
      activeCallEntryFunction,
    });
  const normalizedSearchQuery = useMemo(
    () => normalizeSearchQuery(searchQuery),
    [searchQuery],
  );

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
    if (graphMode !== "graph" || nodes.length === 0) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      reactFlowInstanceRef.current?.fitView({ padding: 0.18, duration: 180 });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [edges.length, focusedNodeId, graphMode, nodes.length]);

  const clearFocus = useCallback(() => {
    setFocusedNodeId(null);
  }, []);

  useSearchHotkeys({
    searchInputRef,
    onEscape: clearFocus,
  });

  const handleNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    setFocusedNodeId(node.id);
  }, []);

  const selectAnalysisMode = useCallback((nextMode: AnalysisMode) => {
    setAnalysisMode(nextMode);
    setGraphMode("graph");
    setFocusedNodeId(null);
    setSearchQuery("");
  }, []);

  const handleCallGraphSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setActiveCallEntryFunction(callEntryFunction.trim());
      setFocusedNodeId(null);
      setSearchQuery("");
      setGraphMode("graph");
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

  const selectSearchResult = useCallback((nodeId: string) => {
    setFocusedNodeId(nodeId);
    setGraphMode("graph");
  }, []);

  const clearSearch = useCallback(() => {
    setSearchQuery("");
  }, []);

  const handleIssueSelect = useCallback(
    (issue: GraphIssue) => {
      const issueNodeId = findIssueNodeId(issue, layoutedGraph.nodes);
      if (issueNodeId) {
        setFocusedNodeId(issueNodeId);
        setGraphMode("graph");
      }
    },
    [layoutedGraph.nodes],
  );

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

  const statsLabel = `${analysisMode === "call" ? "call graph" : "dependencies"} · ${nodes.length}/${graph.nodes.length} nodes · ${edges.length}/${graph.edges.length} edges · ${graph.issues.length} issues`;
  const searchPlaceholder =
    analysisMode === "call" ? "Search functions..." : "Search files...";

  return (
    <div style={appStyle}>
      <GraphToolbar
        analysisMode={analysisMode}
        graphMode={graphMode}
        searchInputRef={searchInputRef}
        searchQuery={searchQuery}
        searchPlaceholder={searchPlaceholder}
        searchResults={searchResults}
        searchResultCount={searchMatches.length}
        focusedNodeId={focusedNodeId}
        focusedLabel={focusedLabel}
        callEntryFunction={callEntryFunction}
        statsLabel={statsLabel}
        metrics={metrics}
        loadError={loadError}
        isLoading={isLoading}
        onAnalysisModeChange={selectAnalysisMode}
        onGraphModeChange={setGraphMode}
        onCallEntryFunctionChange={setCallEntryFunction}
        onCallGraphSubmit={handleCallGraphSubmit}
        onSearchQueryChange={setSearchQuery}
        onSearchSelect={selectSearchResult}
        onSearchClear={clearSearch}
        onClearFocus={clearFocus}
      />

      <div style={graphAreaStyle}>
        {graphMode === "graph" ? (
          <>
            <ReactFlow
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
            <GraphCanvasState
              analysisMode={analysisMode}
              activeCallEntryFunction={activeCallEntryFunction}
              isLoading={isLoading}
              loadError={loadError}
              nodeCount={graph.nodes.length}
              issueCount={graph.issues.length}
            />
            <IssuesPanel
              issues={graph.issues}
              onIssueSelect={handleIssueSelect}
            />
          </>
        ) : (
          <pre style={rawJsonStyle}>{rawJson}</pre>
        )}
      </div>
    </div>
  );
}
