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
import { extractGraph } from "@oxgraph/core";

type CliOptions = {
  apiOnly: boolean;
  openBrowser: boolean;
  targetPath: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_PORT = Number(process.env.OXGRAPH_PORT ?? 8888);
const UI_DIST_PATH = path.resolve(__dirname, "../../public-ui");
const DEFAULT_ENTRY = path.resolve(process.cwd(), "packages/ui/src/main.tsx");

function parseCliOptions(): CliOptions {
  const args = process.argv.slice(2);
  const fileFlagIndex = args.findIndex(
    (arg) => arg === "--file" || arg === "-f",
  );
  const flaggedPath =
    fileFlagIndex !== -1 ? args[fileFlagIndex + 1] : undefined;
  const positionalArg = args.find((arg) => !arg.startsWith("-"));
  const targetPath = flaggedPath || positionalArg;

  return {
    apiOnly: args.includes("--api-only"),
    openBrowser: !args.includes("--no-open"),
    targetPath: resolveTargetPath(targetPath),
  };
}

function resolveTargetPath(cliPath?: string) {
  if (cliPath) {
    return path.resolve(process.cwd(), cliPath);
  }

  if (existsSync(DEFAULT_ENTRY)) {
    return DEFAULT_ENTRY;
  }

  return process.cwd();
}

function contentTypeFor(filePath: string) {
  const ext = path.extname(filePath);
  if (ext === ".js") return "text/javascript";
  if (ext === ".css") return "text/css";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".ico") return "image/x-icon";
  return "text/html";
}

function serveStatic(req: IncomingMessage, res: ServerResponse) {
  const filePath = req.url === "/" ? "/index.html" : req.url || "/index.html";
  const absolutePath = path.join(UI_DIST_PATH, filePath);

  if (!existsSync(absolutePath)) {
    res.writeHead(404);
    res.end("File not found.");
    return;
  }

  res.writeHead(200, { "Content-Type": contentTypeFor(absolutePath) });
  res.end(readFileSync(absolutePath));
}

function createAppServer(graphData: unknown, apiOnly: boolean) {
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
  graphData: unknown,
  options: CliOptions,
  port: number,
  attempt = 0,
) {
  const server = createAppServer(graphData, options.apiOnly);

  server.once("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE" && attempt < 10) {
      const nextPort = port + 1;
      console.warn(`Port ${port} ist belegt, weiche auf ${nextPort} aus.`);
      listenWithFallback(graphData, options, nextPort, attempt + 1);
      return;
    }

    throw err;
  });

  server.listen(port, async () => {
    const url = `http://localhost:${port}`;
    const mode = options.apiOnly ? "API" : "UI";
    console.log(`oxgraph ${mode} gestartet auf ${url}`);

    if (!options.apiOnly && options.openBrowser) {
      await open(url);
    }
  });
}

const options = parseCliOptions();

console.time("Rust AST Parsing & Resolution");
const graphData = extractGraph(options.targetPath);
console.timeEnd("Rust AST Parsing & Resolution");

listenWithFallback(graphData, options, BASE_PORT);
