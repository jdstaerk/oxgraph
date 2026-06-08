import type { Edge, Node } from "reactflow";

export type GraphNodeKind =
  | "entry"
  | "file"
  | "ghost"
  | "function"
  | "method"
  | "arrowFunction"
  | "unresolved";
export type GraphNodeStatus =
  | "resolved"
  | "unresolved"
  | "syntaxError"
  | "readError";

export type GraphNodeData = {
  label: string;
  name?: string;
  path: string;
  file?: string;
  kind: GraphNodeKind;
  status: GraphNodeStatus;
  isEntry: boolean;
  spanStart?: number;
  spanEnd?: number;
  focused?: boolean;
  searchMatch?: boolean;
};

export type GraphEdgeData = {
  specifier?: string;
  calleeName?: string;
  kind?: string;
  confidence?: string;
  isCircular?: boolean;
  unresolved: boolean;
};

export type GraphNode = {
  id: string;
  type?: string;
  data?: Partial<GraphNodeData>;
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  type?: string;
  sourceHandle?: string;
  targetHandle?: string;
  animated?: boolean;
  data?: Partial<GraphEdgeData>;
};

export type GraphIssue = {
  id: string;
  file: string;
  kind: string;
  message: string;
};

export type GraphPayload = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  issues: GraphIssue[];
};

export type GraphResponse = Partial<GraphPayload>;

export type LayoutedGraphNode = Node<GraphNodeData>;
export type LayoutedGraphEdge = Edge<GraphEdgeData>;

export type LayoutedGraph = {
  nodes: LayoutedGraphNode[];
  edges: LayoutedGraphEdge[];
};
