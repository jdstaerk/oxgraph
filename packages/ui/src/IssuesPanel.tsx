import { useMemo, useState, type CSSProperties } from "react";
import type { GraphIssue } from "./graphTypes";

type IssuesPanelProps = {
  issues: GraphIssue[];
  onIssueSelect: (issue: GraphIssue) => void;
};

const panelStyle: CSSProperties = {
  position: "absolute",
  left: 16,
  bottom: 16,
  zIndex: 10,
  width: "min(560px, calc(100vw - 32px))",
  border: "1px solid #334155",
  borderRadius: 8,
  background: "rgba(11, 18, 32, 0.96)",
  boxShadow: "0 18px 42px rgba(0, 0, 0, 0.36)",
  overflow: "hidden",
};

function compactPath(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts.length > 3 ? parts.slice(-3).join("/") : path;
}

export default function IssuesPanel({
  issues,
  onIssueSelect,
}: IssuesPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const visibleIssues = useMemo(() => issues.slice(0, 8), [issues]);

  if (issues.length === 0) {
    return null;
  }

  return (
    <div style={panelStyle}>
      <button
        type="button"
        className="panel-btn"
        style={{ display: "flex", justifyContent: "space-between", gap: 12, color: "#e2e8f0" }}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span style={{ fontWeight: 700 }}>{issues.length} issues</span>
        <span style={{ color: "#94a3b8" }}>{isOpen ? "Hide" : "Show"}</span>
      </button>
      {isOpen ? (
        <div style={{ maxHeight: 320, overflow: "auto" }}>
          {visibleIssues.map((issue) => (
            <button
              key={issue.id}
              type="button"
              className="panel-btn"
              onClick={() => onIssueSelect(issue)}
            >
              <div style={{ fontSize: 12, fontWeight: 700 }}>
                {issue.kind} · {compactPath(issue.file)}
              </div>
              <div
                style={{
                  marginTop: 4,
                  color: "#94a3b8",
                  fontSize: 11,
                  lineHeight: 1.45,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {issue.message}
              </div>
            </button>
          ))}
          {issues.length > visibleIssues.length ? (
            <div
              style={{
                padding: "8px 12px",
                color: "#94a3b8",
                fontSize: 11,
              }}
            >
              Showing {visibleIssues.length} of {issues.length}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
