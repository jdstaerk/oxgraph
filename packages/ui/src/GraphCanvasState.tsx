import type { CSSProperties } from "react";
import type { AnalysisMode } from "./appTypes";

type GraphCanvasStateProps = {
  analysisMode: AnalysisMode;
  activeCallEntryFunction: string;
  isLoading: boolean;
  loadError: string | null;
  nodeCount: number;
  issueCount: number;
};

const overlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  pointerEvents: "none",
  zIndex: 5,
};

const messageStyle: CSSProperties = {
  width: "min(460px, calc(100vw - 48px))",
  border: "1px solid #334155",
  borderRadius: 8,
  background: "rgba(11, 18, 32, 0.94)",
  color: "#e2e8f0",
  padding: "16px 18px",
  boxShadow: "0 18px 42px rgba(0, 0, 0, 0.36)",
};

function emptyTitle(analysisMode: AnalysisMode): string {
  return analysisMode === "call"
    ? "No call graph nodes found"
    : "No dependency nodes found";
}

function emptyDescription(
  analysisMode: AnalysisMode,
  activeCallEntryFunction: string,
  issueCount: number,
): string {
  if (analysisMode === "call" && activeCallEntryFunction) {
    return `No reachable internal calls were found for "${activeCallEntryFunction}".`;
  }

  if (analysisMode === "call") {
    return "Try searching for a specific function, or inspect issues if the project could not be analyzed completely.";
  }

  if (issueCount > 0) {
    return "The graph is empty, but analysis issues were reported. Open the issues panel for details.";
  }

  return "The selected entry did not produce a visible dependency graph.";
}

export default function GraphCanvasState({
  analysisMode,
  activeCallEntryFunction,
  isLoading,
  loadError,
  nodeCount,
  issueCount,
}: GraphCanvasStateProps) {
  if (!isLoading && !loadError && nodeCount > 0) {
    return null;
  }

  const title = isLoading
    ? "Loading graph"
    : loadError
      ? "Could not load graph"
      : emptyTitle(analysisMode);
  const description = isLoading
    ? "Parsing and laying out the project..."
    : loadError
      ? loadError
      : emptyDescription(analysisMode, activeCallEntryFunction, issueCount);

  return (
    <div style={overlayStyle}>
      <div style={messageStyle}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
        <div style={{ marginTop: 6, color: "#94a3b8", fontSize: 12 }}>
          {description}
        </div>
      </div>
    </div>
  );
}
