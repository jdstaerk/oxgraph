import type { GraphNodeData } from "./graphTypes";

const PATH_MARKERS = new Set([
  "app",
  "components",
  "hooks",
  "lib",
  "packages",
  "pages",
  "src",
]);

function trimMiddle(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  const keep = Math.max(8, Math.floor((maxLength - 3) / 2));
  return `${value.slice(0, keep)}...${value.slice(-keep)}`;
}

export function compactPath(path: string, maxLength = 58): string {
  const normalizedPath = path.replaceAll("\\", "/");
  const parts = normalizedPath.split("/").filter(Boolean);
  const markerIndex = parts.findIndex((part) => PATH_MARKERS.has(part));
  const meaningfulParts = markerIndex >= 0 ? parts.slice(markerIndex) : parts;
  const compactedPath = meaningfulParts.join("/") || normalizedPath;
  return trimMiddle(compactedPath, maxLength);
}

export function iconForNode(data: GraphNodeData): string {
  if (data.kind === "file") return "📄";
  if (data.kind === "function" || data.kind === "arrowFunction") return "ƒ";
  if (data.kind === "method") return "Ⓜ";
  if (data.kind === "external") return "📦";
  if (data.kind === "ghost") return "👻";
  if (data.kind === "entry") return "🚀";
  return "⚡";
}

export function nodeSubtitle(data: GraphNodeData): string {
  if (data.kind === "ghost") {
    return "unresolved import";
  }

  if (data.kind === "external") {
    return "external package";
  }

  const sourcePath = data.file ?? data.path;
  return compactPath(sourcePath);
}

export type NodeBadge = { label: string; color: string };

export function nodeBadges(data: GraphNodeData): NodeBadge[] {
  const badges: NodeBadge[] = [];

  if (data.isEntry) {
    badges.push({ label: "entry", color: "#0ea5e9" });
  }

  if (data.kind === "ghost" || data.kind === "external") {
    badges.push({ label: data.kind, color: data.kind === "ghost" ? "#ef4444" : "#a855f7" });
  }

  if (data.kind === "method") {
    badges.push({ label: "method", color: "#10b981" });
  }

  if (data.kind === "arrowFunction") {
    badges.push({ label: "arrow", color: "#f59e0b" });
  }

  if (data.status !== "resolved") {
    badges.push({ label: data.status, color: "#f43f5e" });
  }

  return badges;
}
