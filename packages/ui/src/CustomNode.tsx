import { Handle, Position, type NodeProps } from "reactflow";
import type { CSSProperties } from "react";
import type { GraphNodeData } from "./graphTypes";
import { iconForNode, nodeBadges, nodeSubtitle } from "./nodeDisplay";

const nodeStyleBase: CSSProperties = {
  width: 240,
  minHeight: 56,
  padding: "8px 12px",
  color: "#f8fafc",
  borderRadius: 8,
  fontSize: 13,
  fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.22)",
  textAlign: "left",
};

const badgeStyleBase: CSSProperties = {
  border: "1px solid #475569",
  borderRadius: 999,
  padding: "2px 6px",
  fontSize: 10,
  lineHeight: 1,
};

function borderFor(data: GraphNodeData): string {
  if (data.focused) {
    return "2px solid #facc15";
  }

  if (data.searchMatch) {
    return "2px solid #22c55e";
  }

  if (data.kind === "entry") {
    return "1px solid #38bdf8";
  }

  return "1px solid #475569";
}

function backgroundFor(data: GraphNodeData): string {
  if (data.kind === "ghost") {
    return "#3f1d1d";
  }

  if (data.kind === "external") {
    return "#27272a";
  }

  return "#1e293b";
}

export default function CustomNode({ data }: NodeProps<GraphNodeData>) {
  const badges = nodeBadges(data);

  return (
    <div
      title={data.path || data.label}
      className="custom-node"
      style={{
        ...nodeStyleBase,
        background: backgroundFor(data),
        border: borderFor(data),
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        style={{ background: "#3b82f6" }}
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          overflow: "hidden",
        }}
      >
        <span style={{ fontSize: 14, opacity: 0.8 }}>{iconForNode(data)}</span>
        <div
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontWeight: 700,
            lineHeight: 1.25,
          }}
        >
          {data.label}
        </div>
      </div>
      <div
        style={{
          marginTop: 6,
          color: "#cbd5e1",
          fontSize: 11,
          lineHeight: 1.2,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {nodeSubtitle(data)}
      </div>
      {badges.length > 0 ? (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 4,
            marginTop: 7,
          }}
        >
          {badges.map((badge) => (
            <span
              key={badge.label}
              style={{
                ...badgeStyleBase,
                borderColor: badge.color,
                color: badge.color,
              }}
            >
              {badge.label}
            </span>
          ))}
        </div>
      ) : null}

      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={{ background: "#10b981" }}
      />
    </div>
  );
}
