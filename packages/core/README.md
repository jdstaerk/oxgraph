# @oxgraph/core

<p align="center">
  <strong>Native Rust graph analysis engine for oxgraph.</strong><br />
  High-speed dependency and call graph extraction for JavaScript and TypeScript projects.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@oxgraph/core"><img alt="npm" src="https://img.shields.io/npm/v/@oxgraph/core?color=0ea5e9" /></a>
  <a href="https://github.com/jdstaerk/oxgraph/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/jdstaerk/oxgraph/actions/workflows/ci.yml/badge.svg" /></a>
  <a href="https://github.com/jdstaerk/oxgraph/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-blue.svg" /></a>
  <img alt="Node" src="https://img.shields.io/badge/node-%3E%3D22.13-339933" />
</p>

<p align="center">
  <a href="https://github.com/jdstaerk/oxgraph">Repository</a>
  |
  <a href="https://www.npmjs.com/package/@oxgraph/cli">CLI package</a>
  |
  <a href="https://jdstaerk.github.io/oxgraph/">Live demo</a>
</p>

`@oxgraph/core` is the native NAPI package behind oxgraph. It parses source files with the Oxc ecosystem, resolves imports, builds dependency and call graph models, and returns compact React Flow-compatible payloads to Node.js.

Most users should install [`@oxgraph/cli`](https://www.npmjs.com/package/@oxgraph/cli), which bundles this engine with a local server and the interactive UI.

## Install

```bash
npm install @oxgraph/core
```

```bash
pnpm add @oxgraph/core
```

Node.js 22.13 or newer is recommended. Published packages include native bindings for macOS, Windows, Linux glibc, and Linux musl on x64 and arm64.

## Usage

```js
import { extractCallGraph, extractGraph } from "@oxgraph/core";

const dependencyGraph = extractGraph(process.cwd());
const callGraph = extractCallGraph(process.cwd());
const focusedCallGraph = extractCallGraph(process.cwd(), "App");

console.log(dependencyGraph.nodes.length);
console.log(callGraph.edges.length);
console.log(focusedCallGraph.issues);
```

## API

### `extractGraph(targetPath)`

Analyzes a file or directory and returns the dependency graph payload:

```ts
type GraphData = {
  nodes: ReactFlowNode[];
  edges: ReactFlowEdge[];
  issues: GraphIssueData[];
};
```

### `extractCallGraph(targetPath, entryFunction?)`

Analyzes function, method, arrow function, and React component relationships. When `entryFunction` is provided, the graph is focused from that function name.

```ts
type CallGraphData = {
  nodes: ReactFlowCallNode[];
  edges: ReactFlowCallEdge[];
  issues: CallGraphIssueData[];
};
```

Both APIs return serialized graph data only. The full AST stays inside Rust memory and does not cross the NAPI boundary.

## What It Analyzes

- JS, JSX, TS, and TSX source files.
- ESM imports, TypeScript path aliases, and Node-style module resolution.
- Internal function declarations, methods, arrow functions, and React component usage.
- Unresolved import and call graph issues as separate diagnostics.

oxgraph intentionally filters third-party modules, native prototype methods, and framework internals so the graph stays focused on internal code ownership.

## Payload Shape

```json
{
  "nodes": [
    {
      "id": "src/App.tsx",
      "type": "custom",
      "data": {
        "label": "App.tsx",
        "path": "src/App.tsx",
        "kind": "entry",
        "status": "resolved",
        "isEntry": true
      }
    }
  ],
  "edges": [
    {
      "id": "src/App.tsx->src/main.tsx",
      "source": "src/App.tsx",
      "target": "src/main.tsx",
      "data": {
        "specifier": "./main",
        "isCircular": false,
        "unresolved": false
      }
    }
  ],
  "issues": []
}
```

## Repository

- Source: <https://github.com/jdstaerk/oxgraph>
- Issues: <https://github.com/jdstaerk/oxgraph/issues>
- License: MIT
