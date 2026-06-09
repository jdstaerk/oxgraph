import type { CSSProperties } from "react";
import type { AnalysisMode } from "./appTypes";
import type { GraphStartPoint } from "./graphUtils";

type GraphStartPanelProps = {
  analysisMode: AnalysisMode;
  startPoints: GraphStartPoint[];
  onSelect: (nodeId: string) => void;
};

const panelStyle: CSSProperties = {
  position: "absolute",
  left: 16,
  top: 16,
  zIndex: 9,
  width: 340,
  maxWidth: "calc(100vw - 32px)",
  border: "1px solid #334155",
  borderRadius: 8,
  background: "rgba(11, 18, 32, 0.95)",
  boxShadow: "0 18px 42px rgba(0, 0, 0, 0.34)",
  overflow: "hidden",
};

const headerStyle: CSSProperties = {
  padding: "9px 12px",
  borderBottom: "1px solid #1e293b",
  fontSize: 12,
  fontWeight: 700,
};

const buttonStyle: CSSProperties = {
  width: "100%",
  border: "none",
  borderBottom: "1px solid #1e293b",
  background: "transparent",
  color: "#e2e8f0",
  cursor: "pointer",
  padding: "9px 12px",
  textAlign: "left",
};

function titleFor(analysisMode: AnalysisMode): string {
  return analysisMode === "call" ? "Call roots" : "Start points";
}

export default function GraphStartPanel({
  analysisMode,
  startPoints,
  onSelect,
}: GraphStartPanelProps) {
  if (startPoints.length === 0) {
    return null;
  }

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>{titleFor(analysisMode)}</div>
      {startPoints.map((startPoint) => (
        <button
          key={startPoint.id}
          type="button"
          style={buttonStyle}
          onClick={() => onSelect(startPoint.id)}
        >
          <div
            style={{
              display: "flex",
              gap: 10,
              justifyContent: "space-between",
              minWidth: 0,
            }}
          >
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {startPoint.label}
            </span>
            <span
              style={{
                color: "#94a3b8",
                flex: "0 0 auto",
                fontSize: 11,
              }}
            >
              {startPoint.scoreLabel}
            </span>
          </div>
          <div
            style={{
              marginTop: 4,
              color: "#94a3b8",
              fontSize: 11,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {startPoint.detail}
          </div>
        </button>
      ))}
    </div>
  );
}
