#!/usr/bin/env node
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import open from "open";
import { extractGraph, type GraphData } from "@oxgraph/core";

type CliOptions = {
  apiOnly: boolean;
  openBrowser: boolean;
  targetPath: string;
};

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const defaultPort = Number(process.env.OXGRAPH_PORT ?? 8888);
const uiDistDir = path.resolve(currentDir, "../../public-ui");
const defaultEntryPath = path.resolve(process.cwd(), "packages/ui/src/main.tsx");

function parseCliOptions(): CliOptions {
  const args = process.argv.slice(2);
  const targetFlagIndex = args.findIndex(
    (arg) => arg === "--file" || arg === "-f",
  );
  const flaggedTargetPath =
    targetFlagIndex !== -1 ? args[targetFlagIndex + 1] : undefined;
  const positionalTargetPath = args.find(
    (arg, index) =>
      !arg.startsWith("-") && index !== targetFlagIndex + 1,
  );
  const targetPath = flaggedTargetPath || positionalTargetPath;

  return {
    apiOnly: args.includes("--api-only"),
    openBrowser: !args.includes("--no-open"),
    targetPath: resolveTargetPath(targetPath),
  };
}

function resolveTargetPath(cliPath?: string): string {
  if (cliPath) {
    return path.resolve(process.cwd(), cliPath);
  }

  if (existsSync(defaultEntryPath)) {
    return defaultEntryPath;
  }

  return process.cwd();
}

function contentTypeFor(filePath: string): string {
  const extension = path.extname(filePath);
  if (extension === ".js") return "text/javascript";
  if (extension === ".css") return "text/css";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".ico") return "image/x-icon";
  return "text/html";
}

function resolveStaticPath(requestUrl = "/"): string | null {
  const pathname = new URL(requestUrl, "http://localhost").pathname;
  const requestedPath =
    pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const staticPath = path.resolve(uiDistDir, requestedPath);
  const allowedRoot = `${uiDistDir}${path.sep}`;

  if (staticPath !== uiDistDir && !staticPath.startsWith(allowedRoot)) {
    return null;
  }

  return staticPath;
}

function serveStatic(req: IncomingMessage, res: ServerResponse): void {
  const staticPath = resolveStaticPath(req.url);

  if (!staticPath) {
    res.writeHead(403);
    res.end("Forbidden.");
    return;
  }

  if (!existsSync(staticPath)) {
    res.writeHead(404);
    res.end("File not found.");
    return;
  }

  res.writeHead(200, { "Content-Type": contentTypeFor(staticPath) });
  res.end(readFileSync(staticPath));
}

function createAppServer(graphData: GraphData, apiOnly: boolean) {
  return createServer((req, res) => {
    if (req.url === "/api/graph-data") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(graphData));
      return;
    }

    if (apiOnly) {
      res.writeHead(404);
      res.end("API server only.");
      return;
    }

    serveStatic(req, res);
  });
}

function listenWithFallback(
  graphData: GraphData,
  options: CliOptions,
  port: number,
  attempt = 0,
): void {
  const server = createAppServer(graphData, options.apiOnly);

  server.once("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE" && attempt < 10) {
      const nextPort = port + 1;
      console.warn(`Port ${port} is in use, trying ${nextPort}.`);
      listenWithFallback(graphData, options, nextPort, attempt + 1);
      return;
    }

    throw err;
  });

  server.listen(port, async () => {
    const url = `http://localhost:${port}`;
    const mode = options.apiOnly ? "API" : "UI";
    console.log(`oxgraph ${mode} started at ${url}`);

    if (!options.apiOnly && options.openBrowser) {
      await open(url);
    }
  });
}

const options = parseCliOptions();

console.time("Rust AST Parsing & Resolution");
const graphData = extractGraph(options.targetPath);
console.timeEnd("Rust AST Parsing & Resolution");

listenWithFallback(graphData, options, defaultPort);
