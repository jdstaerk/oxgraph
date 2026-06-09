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

export function nodeBadges(data: GraphNodeData): string[] {
  const badges: string[] = [];

  if (data.isEntry) {
    badges.push("entry");
  }

  if (data.kind === "ghost" || data.kind === "external") {
    badges.push(data.kind);
  }

  if (data.kind === "method") {
    badges.push("method");
  }

  if (data.kind === "arrowFunction") {
    badges.push("arrow");
  }

  if (data.status !== "resolved") {
    badges.push(data.status);
  }

  return badges;
}
