export type AnalysisMode = "dependency" | "call";

export type GraphMode = "graph" | "raw";

export type GraphMetrics = {
  fetchMs: number;
  layoutMs: number;
};
