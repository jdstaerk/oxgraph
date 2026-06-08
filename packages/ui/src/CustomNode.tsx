import { Handle, Position, type NodeProps } from "reactflow";
import type { CSSProperties } from "react";
import type { GraphNodeData } from "./graphTypes";

const nodeStyleBase: CSSProperties = {
  width: 200,
  minHeight: 50,
  padding: "8px 12px",
  color: "#f8fafc",
  borderRadius: 8,
  fontSize: 13,
  fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.22)",
  textAlign: "left",
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
  return (
    <div
      title={data.path || data.label}
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
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontWeight: 700,
          lineHeight: 1.25,
        }}
      >
        {data.label}
      </div>
      <div
        style={{
          marginTop: 6,
          display: "flex",
          gap: 6,
          color: "#cbd5e1",
          fontSize: 11,
          lineHeight: 1,
        }}
      >
        <span>{data.kind}</span>
        <span>{data.status}</span>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={{ background: "#10b981" }}
      />
    </div>
  );
}
