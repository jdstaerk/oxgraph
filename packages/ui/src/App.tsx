import { useCallback, useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import ReactFlow, {
  Background,
  Controls,
  useNodesState,
  useEdgesState,
} from "reactflow";
import "reactflow/dist/style.css";
import CustomNode from "./CustomNode";
import { getLayoutedElements } from "./layout";

type GraphMode = "graph" | "raw";

type GraphPayload = {
  nodes?: Array<any>;
  edges?: Array<any>;
  issues?: Array<any>;
};

type GraphMetrics = {
  fetchMs: number;
  layoutMs: number;
};

type LayoutedGraphState = {
  nodes: Array<any>;
  edges: Array<any>;
};

const nodeTypes = {
  custom: CustomNode,
};

function collectFocusedNodeIds(startNodeId: string, edges: Array<any>) {
  const related = new Set<string>([startNodeId]);
  const importerQueue = [startNodeId];

  // Direct dependencies of the focused file.
  for (const edge of edges) {
    if (edge.source === startNodeId) {
      related.add(edge.target);
    }
  }

  // Recursive importers of the focused file.
  while (importerQueue.length > 0) {
    const currentNodeId = importerQueue.shift();
    if (!currentNodeId) {
      continue;
    }

    for (const edge of edges) {
      if (edge.target !== currentNodeId || related.has(edge.source)) {
        continue;
      }

      related.add(edge.source);
      importerQueue.push(edge.source);
    }
  }

  return related;
}

function filterGraphByFocus(
  graph: LayoutedGraphState,
  focusedNodeId: string | null,
): LayoutedGraphState {
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

  return {
    nodes: visibleNodes,
    edges: graph.edges.filter((edge) => (
      visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
    )),
  };
}

export default function App() {
  const [mode, setMode] = useState<GraphMode>("graph");
  const [graph, setGraph] = useState<GraphPayload>({ nodes: [], edges: [], issues: [] });
  const [layoutedGraph, setLayoutedGraph] = useState<LayoutedGraphState>({
    nodes: [],
    edges: [],
  });
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<GraphMetrics | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    let isActive = true;
    const fetchStartedAt = performance.now();

    fetch("/api/graph-data")
      .then((res) => {
        if (!res.ok) {
          throw new Error("Netzwerk-Fehler beim Laden der Graph-Daten");
        }
        return res.json();
      })
      .then(async (data: GraphPayload) => {
        const fetchFinishedAt = performance.now();
        const safeGraph = {
          nodes: data.nodes || [],
          edges: data.edges || [],
          issues: data.issues || [],
        };
        const layoutStartedAt = performance.now();
        const { layoutedNodes, layoutedEdges } = await getLayoutedElements(
          safeGraph.nodes,
          safeGraph.edges,
        );
        const layoutFinishedAt = performance.now();

        if (!isActive) {
          return;
        }

        setGraph(safeGraph);
        setFocusedNodeId(null);
        setLayoutedGraph({
          nodes: layoutedNodes,
          edges: layoutedEdges,
        });
        setMetrics({
          fetchMs: fetchFinishedAt - fetchStartedAt,
          layoutMs: layoutFinishedAt - layoutStartedAt,
        });
      })
      .catch((err) => console.error(err));

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    const visibleGraph = filterGraphByFocus(layoutedGraph, focusedNodeId);
    setNodes(visibleGraph.nodes);
    setEdges(visibleGraph.edges);
  }, [focusedNodeId, layoutedGraph, setEdges, setNodes]);

  const handleNodeClick = useCallback((_event: MouseEvent, node: any) => {
    setFocusedNodeId(node.id);
  }, []);

  const clearFocus = useCallback(() => {
    setFocusedNodeId(null);
  }, []);

  const rawJson = useMemo(() => JSON.stringify(graph, null, 2), [graph]);
  const focusedLabel = useMemo(() => {
    if (!focusedNodeId) {
      return null;
    }

    const focusedNode = layoutedGraph.nodes.find((node) => node.id === focusedNodeId);
    return focusedNode?.data?.label || focusedNodeId;
  }, [focusedNodeId, layoutedGraph.nodes]);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#0f172a",
        color: "#e2e8f0",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 16px",
          borderBottom: "1px solid #1e293b",
          background: "#0b1220",
          flex: "0 0 auto",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700 }}>oxgraph</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setMode("graph")}
            style={{
              border: "1px solid #334155",
              background: mode === "graph" ? "#1d4ed8" : "#0f172a",
              color: "#e2e8f0",
              padding: "6px 10px",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Graph
          </button>
          <button
            type="button"
            onClick={() => setMode("raw")}
            style={{
              border: "1px solid #334155",
              background: mode === "raw" ? "#1d4ed8" : "#0f172a",
              color: "#e2e8f0",
              padding: "6px 10px",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Raw JSON
          </button>
        </div>
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
              Fokus: {focusedLabel}
            </span>
            <button
              type="button"
              onClick={clearFocus}
              style={{
                border: "1px solid #334155",
                background: "#0f172a",
                color: "#e2e8f0",
                padding: "6px 10px",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Alle
            </button>
          </div>
        ) : null}
        <div style={{ marginLeft: "auto", fontSize: 12, color: "#94a3b8" }}>
          {nodes.length}/{graph.nodes?.length ?? 0} nodes · {edges.length}/{graph.edges?.length ?? 0} edges ·{" "}
          {graph.issues?.length ?? 0} issues
          {metrics
            ? ` · fetch ${Math.round(metrics.fetchMs)}ms · layout ${Math.round(metrics.layoutMs)}ms`
            : ""}
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
          <pre
            style={{
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
            }}
          >
            {rawJson}
          </pre>
        )}
      </div>
    </div>
  );
}
