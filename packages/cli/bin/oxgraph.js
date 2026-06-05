#!/usr/bin/env node
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import open from "open";

// BÄM! Der Import deines nativen Rust-Moduls
import { extractGraph } from "@oxgraph/core";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 8080;
const UI_DIST_PATH = path.resolve(__dirname, "../public-ui");

// 1. Lass Rust den aktuellen Ordner scannen!
const currentDir = process.cwd();
console.time("Rust AST Parsing & Resolution");
const graphData = extractGraph(currentDir);
console.timeEnd("Rust AST Parsing & Resolution");

// 2. Den Node-Server starten (Code bleibt wie zuvor)
const server = createServer((req, res) => {
  if (req.url === "/api/graph-data") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(graphData)); // Hier reichen wir die Rust-Daten durch
    return;
  }

  // ... (Restlicher statischer Datei-Server Code)
  let filePath = req.url === "/" ? "/index.html" : req.url;
  let absolutePath = path.join(UI_DIST_PATH, filePath);

  if (existsSync(absolutePath)) {
    const ext = path.extname(absolutePath);
    let contentType = "text/html";
    if (ext === ".js") contentType = "text/javascript";
    if (ext === ".css") contentType = "text/css";

    res.writeHead(200, { "Content-Type": contentType });
    res.end(readFileSync(absolutePath));
  } else {
    res.writeHead(404);
    res.end("File not found.");
  }
});

server.listen(PORT, async () => {
  console.log(`🚀 oxgraph UI gestartet auf http://localhost:${PORT}`);
  await open(`http://localhost:${PORT}`);
});
