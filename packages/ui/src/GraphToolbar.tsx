import type {
  CSSProperties,
  FormEvent,
  RefObject,
} from "react";
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
  callEntryFunction: string;
  statsLabel: string;
  metrics: GraphMetrics | null;
  loadError: string | null;
  isLoading: boolean;
  onAnalysisModeChange: (mode: AnalysisMode) => void;
  onGraphModeChange: (mode: GraphMode) => void;
  onCallEntryFunctionChange: (value: string) => void;
  onCallGraphSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSearchQueryChange: (query: string) => void;
  onSearchSelect: (nodeId: string) => void;
  onSearchClear: () => void;
  onClearFocus: () => void;
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

const inputStyle: CSSProperties = {
  width: 220,
  height: 32,
  border: "1px solid #334155",
  borderRadius: 6,
  background: "#0f172a",
  color: "#e2e8f0",
  padding: "0 10px",
  outline: "none",
};

function modeButtonStyle(isActive: boolean): CSSProperties {
  return {
    ...buttonStyleBase,
    background: isActive ? "#1d4ed8" : "#0f172a",
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
  callEntryFunction,
  statsLabel,
  metrics,
  loadError,
  isLoading,
  onAnalysisModeChange,
  onGraphModeChange,
  onCallEntryFunctionChange,
  onCallGraphSubmit,
  onSearchQueryChange,
  onSearchSelect,
  onSearchClear,
  onClearFocus,
}: GraphToolbarProps) {
  const headerStatusLabel = isLoading
    ? `${statsLabel} · loading`
    : statsLabel;

  return (
    <div style={headerStyle}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>oxgraph</div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={() => onAnalysisModeChange("dependency")}
          style={modeButtonStyle(analysisMode === "dependency")}
        >
          Dependencies
        </button>
        <button
          type="button"
          onClick={() => onAnalysisModeChange("call")}
          style={modeButtonStyle(analysisMode === "call")}
        >
          Call Graph
        </button>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={() => onGraphModeChange("graph")}
          style={modeButtonStyle(graphMode === "graph")}
        >
          Graph
        </button>
        <button
          type="button"
          onClick={() => onGraphModeChange("raw")}
          style={modeButtonStyle(graphMode === "raw")}
        >
          Raw JSON
        </button>
      </div>
      {analysisMode === "call" ? (
        <form
          onSubmit={onCallGraphSubmit}
          style={{ display: "flex", gap: 8, alignItems: "center" }}
        >
          <input
            aria-label="Function name"
            type="search"
            placeholder="Function name..."
            value={callEntryFunction}
            onChange={(event) => onCallEntryFunctionChange(event.target.value)}
            style={inputStyle}
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
            onClick={onClearFocus}
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
