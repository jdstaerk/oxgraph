import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import path from "node:path";
import { createAppServer, parseCliOptions } from "./oxgraph.js";
import type { GraphData } from "@oxgraph/core";

vi.mock("@oxgraph/core", () => ({
  extractGraph: vi.fn(() => ({ nodes: [], edges: [] })),
  extractCallGraph: vi.fn(() => ({ nodes: [], edges: [], issues: [] })),
}));

describe("CLI Server", () => {
  const mockGraphData: GraphData = {
    nodes: [
      {
        id: "root",
        type: "custom",
        data: {
          label: "root",
          path: "/root",
          kind: "file",
          status: "resolved",
          isEntry: true,
        },
      },
    ],
    edges: [],
    issues: [],
  };

  it("serves the dependency graph at /api/graph-data/dependencies", async () => {
    const server = createAppServer("dummy-path", mockGraphData, true);
    const response = await request(server).get("/api/graph-data/dependencies");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(mockGraphData);
  });

  it("serves the call graph at /api/graph-data/call-graph", async () => {
    const server = createAppServer("dummy-path", mockGraphData, true);
    const response = await request(server).get(
      "/api/graph-data/call-graph?entryFunction=start",
    );

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

  it("parses --file targets with following flags", () => {
    expect(
      parseCliOptions(["--file", "src/main.ts", "--api-only"], "/repo"),
    ).toMatchObject({
      apiOnly: true,
      openBrowser: true,
      targetPath: path.resolve("/repo", "src/main.ts"),
    });
  });

  it("rejects --file without a path value", () => {
    expect(() =>
      parseCliOptions(["--file", "--api-only"], "/repo"),
    ).toThrow("Missing value for --file.");
  });

  it("rejects unknown options", () => {
    expect(() => parseCliOptions(["--unknown"], "/repo")).toThrow(
      "Unknown option: --unknown",
    );
  });
});
