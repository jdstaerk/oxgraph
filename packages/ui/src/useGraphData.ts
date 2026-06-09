import { useEffect, useMemo, useState } from "react";
import type { AnalysisMode, GraphMetrics } from "./appTypes";
import type {
  GraphPayload,
  GraphResponse,
  LayoutedGraph,
} from "./graphTypes";
import {
  emptyGraph,
  emptyLayoutedGraph,
  normalizeGraphResponse,
} from "./graphUtils";
import { getLayoutedElements } from "./layout";

type UseGraphDataOptions = {
  analysisMode: AnalysisMode;
};

type UseGraphDataResult = {
  graph: GraphPayload;
  layoutedGraph: LayoutedGraph;
  metrics: GraphMetrics | null;
  loadError: string | null;
  isLoading: boolean;
};

async function graphResponseErrorMessage(response: Response): Promise<string> {
  const fallback = `Failed to load graph data (${response.status} ${response.statusText})`;
  const contentType = response.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      const body = (await response.json()) as { error?: unknown };
      return typeof body.error === "string" && body.error.trim()
        ? body.error
        : fallback;
    }

    const text = await response.text();
    return text.trim() ? `${fallback}: ${text.trim()}` : fallback;
  } catch {
    return fallback;
  }
}

function graphEndpoint(analysisMode: AnalysisMode): string {
  return analysisMode === "dependency"
    ? "/api/graph-data/dependencies"
    : "/api/graph-data/call-graph";
}

export function useGraphData({
  analysisMode,
}: UseGraphDataOptions): UseGraphDataResult {
  const [graph, setGraph] = useState<GraphPayload>(emptyGraph);
  const [layoutedGraph, setLayoutedGraph] =
    useState<LayoutedGraph>(emptyLayoutedGraph);
  const [metrics, setMetrics] = useState<GraphMetrics | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const endpoint = useMemo(() => graphEndpoint(analysisMode), [analysisMode]);

  useEffect(() => {
    let isActive = true;
    const fetchStartedAt = performance.now();

    setIsLoading(true);
    setLoadError(null);
    setMetrics(null);
    setGraph(emptyGraph());
    setLayoutedGraph(emptyLayoutedGraph());

    const fetchGraph = async () => {
      try {
        const response = await fetch(endpoint);
        if (!response.ok) {
          throw new Error(await graphResponseErrorMessage(response));
        }

        const responseBody = (await response.json()) as GraphResponse;
        const fetchFinishedAt = performance.now();
        const graphPayload = normalizeGraphResponse(responseBody);
        const layoutStartedAt = performance.now();
        const layoutedElements = await getLayoutedElements(
          graphPayload.nodes,
          graphPayload.edges,
          analysisMode,
        );
        const layoutFinishedAt = performance.now();

        if (!isActive) {
          return;
        }

        setGraph(graphPayload);
        setLayoutedGraph(layoutedElements);
        setMetrics({
          fetchMs: fetchFinishedAt - fetchStartedAt,
          layoutMs: layoutFinishedAt - layoutStartedAt,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if (isActive) {
          setLoadError(message);
        }
        console.error(error);
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    void fetchGraph();

    return () => {
      isActive = false;
    };
  }, [endpoint]);

  return { graph, layoutedGraph, metrics, loadError, isLoading };
}
