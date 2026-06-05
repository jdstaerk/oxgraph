#!/usr/bin/env node
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import open from "open";

// ES-Module Fix für __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 8080;
// Wir definieren, dass das fertige UI immer im Ordner "public-ui" neben dem "bin" Ordner liegen wird
const UI_DIST_PATH = path.resolve(__dirname, "../public-ui");

// 1. Später kommt HIER der Rust-Aufruf rein. Fürs MVP nutzen wir Dummy-Daten.
const graphData = {
  nodes: [
    {
      id: "1",
      data: { label: "Rust Core pending..." },
      position: { x: 100, y: 100 },
    },
  ],
  edges: [],
};

// 2. Den lokalen Server starten
const server = createServer((req, res) => {
  // API-Route für das React-Frontend
  if (req.url === "/api/graph-data") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(graphData));
    return;
  }

  // Statische Dateien (Das React UI) ausliefern
  let filePath = req.url === "/" ? "/index.html" : req.url;
  let absolutePath = path.join(UI_DIST_PATH, filePath);

  if (existsSync(absolutePath)) {
    // Sehr rudimentäres MIME-Typing für das MVP
    const ext = path.extname(absolutePath);
    let contentType = "text/html";
    if (ext === ".js") contentType = "text/javascript";
    if (ext === ".css") contentType = "text/css";

    res.writeHead(200, { "Content-Type": contentType });
    res.end(readFileSync(absolutePath));
  } else {
    res.writeHead(404);
    res.end("File not found. Hast du das UI gebaut?");
  }
});

server.listen(PORT, async () => {
  console.log(`🚀 Oxgraph UI gestartet auf http://localhost:${PORT}`);
  await open(`http://localhost:${PORT}`);
});
