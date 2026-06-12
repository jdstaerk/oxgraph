import type { CSSProperties, RefObject } from "react";
import type { AnalysisMode, GraphMetrics, GraphMode } from "./appTypes";
import type { LayoutedGraphNode } from "./graphTypes";
import SearchBox from "./SearchBox";

type GraphToolbarProps = {
  analysisMode: AnalysisMode;
  graphMode: GraphMode;
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchQuery: string;
  searchPlaceholder: string;
  searchResults: LayoutedGraphNode[];
  searchResultCount: number;
  focusedNodeId: string | null;
  focusedLabel: string | null;
  focusDepth: number;
  ghostNodeCount: number;
  showGhostNodes: boolean;
  statsLabel: string;
  metrics: GraphMetrics | null;
  loadError: string | null;
  isLoading: boolean;
  isDemoMode: boolean;
  onAnalysisModeChange: (mode: AnalysisMode) => void;
  onGraphModeChange: (mode: GraphMode) => void;
  onGhostNodesToggle: () => void;
  onSearchQueryChange: (query: string) => void;
  onSearchSelect: (nodeId: string) => void;
  onSearchClear: () => void;
  onClearFocus: () => void;
  onFocusDepthChange: (depth: number) => void;
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

function modeButtonStyle(isActive: boolean): CSSProperties {
  return {
    background: isActive ? "#1d4ed8" : "#0f172a",
    borderColor: isActive ? "#2563eb" : undefined,
  };
}

function toggleButtonStyle(isActive: boolean, isDisabled: boolean): CSSProperties {
  return {
    background: isActive ? "#14532d" : "#0f172a",
    borderColor: isActive ? "#166534" : undefined,
    color: isDisabled ? "#64748b" : "#e2e8f0",
    cursor: isDisabled ? "not-allowed" : "pointer",
    opacity: isDisabled ? 0.62 : 1,
  };
}

function metricsLabel(metrics: GraphMetrics | null): string {
  return metrics
    ? ` · fetch ${Math.round(metrics.fetchMs)}ms · layout ${Math.round(metrics.layoutMs)}ms`
    : "";
}

export default function GraphToolbar({
  analysisMode,
  graphMode,
  searchInputRef,
  searchQuery,
  searchPlaceholder,
  searchResults,
  searchResultCount,
  focusedNodeId,
  focusedLabel,
  focusDepth,
  ghostNodeCount,
  showGhostNodes,
  statsLabel,
  metrics,
  loadError,
  isLoading,
  isDemoMode,
  onAnalysisModeChange,
  onGraphModeChange,
  onGhostNodesToggle,
  onSearchQueryChange,
  onSearchSelect,
  onSearchClear,
  onClearFocus,
  onFocusDepthChange,
}: GraphToolbarProps) {
  const headerStatusLabel = isLoading
    ? `${statsLabel} · loading`
    : statsLabel;

  return (
    <div style={headerStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>oxgraph</div>
        {isDemoMode ? (
          <span
            style={{
              border: "1px solid #0f766e",
              borderRadius: 999,
              color: "#5eead4",
              fontSize: 11,
              lineHeight: 1,
              padding: "3px 7px",
            }}
          >
            Demo data
          </span>
        ) : null}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="toolbar-btn"
          onClick={() => onAnalysisModeChange("dependency")}
          style={modeButtonStyle(analysisMode === "dependency")}
        >
          Dependencies
        </button>
        <button
          type="button"
          className="toolbar-btn"
          onClick={() => onAnalysisModeChange("call")}
          style={modeButtonStyle(analysisMode === "call")}
        >
          Call Graph
        </button>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="toolbar-btn"
          onClick={() => onGraphModeChange("graph")}
          style={modeButtonStyle(graphMode === "graph")}
        >
          Graph
        </button>
        <button
          type="button"
          className="toolbar-btn"
          onClick={() => onGraphModeChange("raw")}
          style={modeButtonStyle(graphMode === "raw")}
        >
          Raw JSON
        </button>
      </div>
      <button
        type="button"
        className="toolbar-btn"
        disabled={ghostNodeCount === 0}
        onClick={onGhostNodesToggle}
        style={toggleButtonStyle(showGhostNodes, ghostNodeCount === 0)}
        title="Show or hide unresolved ghost nodes"
      >
        Ghosts {showGhostNodes ? "on" : "off"}
        {ghostNodeCount > 0 ? ` · ${ghostNodeCount}` : ""}
      </button>
      <SearchBox
        inputRef={searchInputRef}
        query={searchQuery}
        placeholder={searchPlaceholder}
        results={searchResults}
        resultCount={searchResultCount}
        selectedNodeId={focusedNodeId}
        onQueryChange={onSearchQueryChange}
        onSelect={onSearchSelect}
        onClear={onSearchClear}
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
              maxWidth: 240,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            Focus: {focusedLabel}
          </span>
          <select
            value={focusDepth}
            onChange={(e) => onFocusDepthChange(Number(e.target.value))}
            style={{
              background: "#0f172a",
              color: "#e2e8f0",
              border: "1px solid #334155",
              borderRadius: 6,
              padding: "4px 8px",
              outline: "none",
              cursor: "pointer",
            }}
            title="Focus Depth"
          >
            <option value={1}>Direct calls</option>
            <option value={2}>2 levels</option>
            <option value={3}>3 levels</option>
            <option value={999}>Full path</option>
          </select>
          <button
            type="button"
            className="toolbar-btn"
            onClick={onClearFocus}
            style={{ background: "#0f172a" }}
          >
            Clear Focus
          </button>
        </div>
      ) : null}
      <div
        style={{
          marginLeft: "auto",
          minWidth: 180,
          fontSize: 12,
          color: loadError ? "#fca5a5" : "#94a3b8",
          textAlign: "right",
        }}
      >
        {headerStatusLabel}
        {metricsLabel(metrics)}
      </div>
    </div>
  );
}
