import type { AnalysisMode } from "../appTypes";
import type { GraphEdge, GraphNode, LayoutedGraph } from "../graphTypes";
import { layoutCallGraph } from "./callGraphLayout";
import { layoutDependencyGraph } from "./dependencyLayout";
import { isRenderableEdge } from "./shared";

export async function getLayoutedElements(
  nodes: GraphNode[],
  edges: GraphEdge[],
  analysisMode: AnalysisMode = "dependency",
): Promise<LayoutedGraph> {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const renderableEdges = edges.filter((edge) =>
    isRenderableEdge(edge, nodeIds),
  );

  if (analysisMode === "call") {
    return layoutCallGraph(nodes, renderableEdges);
  }

  return layoutDependencyGraph(nodes, renderableEdges);
}
