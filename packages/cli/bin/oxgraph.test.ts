import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createAppServer } from "./oxgraph";
import { GraphData, CallGraphData } from "@oxgraph/core";

vi.mock("@oxgraph/core", () => ({
  extractGraph: vi.fn(() => ({ nodes: [], edges: [] })),
  extractCallGraph: vi.fn(() => ({ nodes: [], edges: [], issues: [] })),
}));

describe("CLI Server", () => {
  const mockGraphData: GraphData = {
    nodes: [{ id: "root", data: { label: "root", kind: "file", status: "resolved", isEntry: true } }],
    edges: [],
  };

  it("serves the dependency graph at /api/graph-data", async () => {
    const server = createAppServer("dummy-path", mockGraphData, true);
    const response = await request(server).get("/api/graph-data");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(mockGraphData);
  });

  it("serves the call graph at /api/call-graph-data", async () => {
    const server = createAppServer("dummy-path", mockGraphData, true);
    const response = await request(server).get("/api/call-graph-data?entryFunction=start");

    expect(response.status).toBe(200);
    expect(response.body.nodes).toBeDefined();
    expect(response.body.edges).toBeDefined();
  });

  it("responds with 404 for unknown routes in api-only mode", async () => {
    const server = createAppServer("dummy-path", mockGraphData, true);
    const response = await request(server).get("/unknown");

    expect(response.status).toBe(404);
    expect(response.text).toBe("API server only.");
  });
});
