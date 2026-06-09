import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
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
import GraphStartPanel from "./GraphStartPanel";
import GraphToolbar from "./GraphToolbar";
import IssuesPanel from "./IssuesPanel";
import type { GraphEdgeData, GraphIssue, GraphNodeData } from "./graphTypes";
import {
  applySearchHighlights,
  filterGraphByGhostVisibility,
  filterGraphByFocus,
  getGraphStartPoints,
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

function nodeColor(node: any) {
  if (node.data?.kind === "ghost") return "#ef4444";
  if (node.data?.kind === "external") return "#a855f7";
  if (node.data?.isEntry) return "#0ea5e9";
  return "#3b82f6";
}

export default function App() {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null);
  const [analysisMode, setAnalysisMode] =
    useState<AnalysisMode>("dependency");
  const [graphMode, setGraphMode] = useState<GraphMode>("graph");
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [focusDepth, setFocusDepth] = useState<number>(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [showGhostNodes, setShowGhostNodes] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState<GraphNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<GraphEdgeData>([]);
  const { graph, layoutedGraph, metrics, loadError, isLoading } =
    useGraphData({
      analysisMode,
    });
  const normalizedSearchQuery = useMemo(
    () => normalizeSearchQuery(searchQuery),
    [searchQuery],
  );
  const visibleBaseGraph = useMemo(
    () => filterGraphByGhostVisibility(layoutedGraph, showGhostNodes),
    [layoutedGraph, showGhostNodes],
  );

  useEffect(() => {
    const visibleGraph = applySearchHighlights(
      filterGraphByFocus(visibleBaseGraph, focusedNodeId, focusDepth),
      normalizedSearchQuery,
    );
    setNodes(visibleGraph.nodes);
    setEdges(visibleGraph.edges);
  }, [
    focusedNodeId,
    focusDepth,
    normalizedSearchQuery,
    setEdges,
    setNodes,
    visibleBaseGraph,
  ]);

  useEffect(() => {
    if (
      focusedNodeId &&
      !visibleBaseGraph.nodes.some((node) => node.id === focusedNodeId)
    ) {
      setFocusedNodeId(null);
    }
  }, [focusedNodeId, visibleBaseGraph.nodes]);

  useEffect(() => {
    if (graphMode !== "graph" || nodes.length === 0) {
      return;
    }

    const fitView = () => {
      const instance = reactFlowInstanceRef.current;
      if (!instance) {
        return;
      }

      if (focusedNodeId) {
        const node = instance.getNode(focusedNodeId);
        if (node && node.width && node.height) {
          const x = node.position.x + node.width / 2;
          const y = node.position.y + node.height / 2;
          void instance.setCenter(x, y, { zoom: 1.2, duration: 400 });
          return;
        }
      }

      if (analysisMode === "call" && !focusedNodeId) {
        void instance.setViewport({ x: 96, y: 72, zoom: 0.82 }, { duration: 180 });
        return;
      }

      instance.fitView({ padding: 0.18, duration: 180 });
    };
    const frameId = window.requestAnimationFrame(fitView);
    const timeoutId = window.setTimeout(fitView, 120);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, [analysisMode, edges.length, focusedNodeId, graphMode, nodes.length, focusDepth]);

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

  const toggleGhostNodes = useCallback(() => {
    setShowGhostNodes((currentValue) => !currentValue);
  }, []);

  const searchMatches = useMemo(() => {
    if (!normalizedSearchQuery) {
      return [];
    }

    return visibleBaseGraph.nodes.filter((node) =>
      matchesSearchQuery(node, normalizedSearchQuery),
    );
  }, [normalizedSearchQuery, visibleBaseGraph.nodes]);
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
      const issueNodeId = findIssueNodeId(issue, visibleBaseGraph.nodes);
      if (issueNodeId) {
        setFocusedNodeId(issueNodeId);
        setGraphMode("graph");
      }
    },
    [visibleBaseGraph.nodes],
  );

  const rawJson = useMemo(() => JSON.stringify(graph, null, 2), [graph]);
  const focusedLabel = useMemo(() => {
    if (!focusedNodeId) {
      return null;
    }

    const focusedNode = visibleBaseGraph.nodes.find(
      (node) => node.id === focusedNodeId,
    );
    return focusedNode?.data.label || focusedNodeId;
  }, [focusedNodeId, visibleBaseGraph.nodes]);

  const statsLabel = `${analysisMode === "call" ? "call graph" : "dependencies"} · ${nodes.length}/${graph.nodes.length} nodes · ${edges.length}/${graph.edges.length} edges · ${graph.issues.length} issues`;
  const searchPlaceholder =
    analysisMode === "call" ? "Search functions..." : "Search files...";
  const ghostNodeCount = useMemo(
    () => layoutedGraph.nodes.filter((node) => node.data.kind === "ghost").length,
    [layoutedGraph.nodes],
  );
  const startPoints = useMemo(
    () => getGraphStartPoints(visibleBaseGraph, analysisMode),
    [analysisMode, visibleBaseGraph],
  );

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
        focusDepth={focusDepth}
        ghostNodeCount={ghostNodeCount}
        showGhostNodes={showGhostNodes}
        statsLabel={statsLabel}
        metrics={metrics}
        loadError={loadError}
        isLoading={isLoading}
        onAnalysisModeChange={selectAnalysisMode}
        onGraphModeChange={setGraphMode}
        onGhostNodesToggle={toggleGhostNodes}
        onSearchQueryChange={setSearchQuery}
        onSearchSelect={selectSearchResult}
        onSearchClear={clearSearch}
        onClearFocus={clearFocus}
        onFocusDepthChange={setFocusDepth}
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
              minZoom={analysisMode === "call" ? 0.04 : 0.02}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#334155" gap={16} />
              <MiniMap 
                nodeColor={nodeColor}
                maskColor="rgba(15, 23, 42, 0.7)"
                style={{ background: "#0b1220", border: "1px solid #334155", borderRadius: 8 }}
              />
              <Controls />
            </ReactFlow>
            <GraphCanvasState
              analysisMode={analysisMode}
              isLoading={isLoading}
              loadError={loadError}
              nodeCount={visibleBaseGraph.nodes.length}
              issueCount={graph.issues.length}
            />
            {!focusedNodeId ? (
              <GraphStartPanel
                analysisMode={analysisMode}
                startPoints={startPoints}
                onSelect={selectSearchResult}
              />
            ) : null}
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
