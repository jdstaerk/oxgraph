# oxgraph

**oxgraph** is a fast, real-time codebase dependency visualizer and call graph generator designed for modern JavaScript and TypeScript projects. 

It leverages the Oxidation Compiler suite (`oxc`) in a native Rust backend to statically analyze your codebase at incredible speeds, providing interactive, visual maps of your file dependencies and function call paths.

*Note: Currently, oxgraph is especially well-suited and optimized for analyzing React projects.*

## Features

- **Lightning-Fast Parsing:** Powered by a Rust backend using `oxc` for AST extraction, entirely avoiding Node.js memory limits.
- **Dependency Graphs:** Automatically extract and map ESM imports, dynamic imports, named re-exports, `export *`, and CommonJS `require()`.
- **Call Graph Generation:** Trace function and method calls across your codebase, starting from a specific entry function.
- **Interactive UI:** Render complex architectures beautifully with an automatic ELK-based layout, search functionality, and focus modes built on React Flow.
- **Intelligent Pruning:** The graph engine automatically filters out noisy framework code and prunes isolated orphan nodes to keep your architectural overview clean and actionable.

## Architecture

oxgraph is structured as a highly optimized monorepo, splitting responsibilities between native performance and web-based visualization to ensure maximum efficiency.

1. **Core (`@oxgraph/core`)**  
   The heavy-lifting engine written in **Rust**. It utilizes the `oxc` parser to rapidly convert JS/TS source code into Abstract Syntax Trees (ASTs). All path resolution (`oxc_resolver`), import extraction, and recursive call graph traversals happen entirely on the native side. The final graph structures are exposed to Node.js via **NAPI-RS**. By keeping the AST inside Rust and only serializing the minimal layout data, oxgraph bypasses the massive memory bottlenecks typically associated with Node.js AST traversal.

2. **CLI & Server (`@oxgraph/cli`)**  
   A Node.js/TypeScript wrapper that acts as the orchestrator. When you run `oxgraph`, the CLI calls the Rust core to parse the target directory. It then spins up a lightweight local HTTP server, statically serving the UI and providing a JSON API bridge (`/api/graph-data`, `/api/call-graph-data`) to send the pre-calculated Rust results directly to the browser.

3. **Web UI (`@oxgraph/ui`)**  
   The visual dashboard built with **Vite, React, and React Flow**. It fetches the parsed API payload from the CLI server and visually plots the nodes and edges. It provides dynamic features like automatic layout calculation, search filtering, a focus mode for inspecting related files, and an issues panel for tracking unresolved imports or syntax errors.

## Requirements

- Node.js 18 or newer
- pnpm 10.x
- Rust toolchain with Cargo
- A platform supported by NAPI-RS

## Installation

```bash
pnpm install
```

Build the native Rust addon:

```bash
pnpm --filter @oxgraph/core run build
```

Build the UI and CLI:

```bash
pnpm run build
```

## Usage

Analyze a project or source directory:

```bash
pnpm run build
pnpm run oxgraph -- --file "C:/path/to/project/src"
```

You can also pass a single entry file:

```bash
pnpm run oxgraph -- --file "C:/path/to/project/src/main.tsx"
```

For a one-off build and start, use:

```bash
pnpm run oxgraph:build -- --file "C:/path/to/project/src"
```

If no file is passed, oxgraph tries to use `packages/ui/src/main.tsx` from the current working directory and then falls back to the current directory.

The CLI starts a local server and opens the UI in your browser by default.

## Development

Build the native addon in development mode:

```bash
pnpm --filter @oxgraph/core run dev
```

Start the API server for a target project:

```bash
pnpm run dev:api -- --file "C:/path/to/project/src"
```

Start the Vite UI with HMR:

```bash
pnpm run dev:ui
```

By default, the UI runs on `http://localhost:5173` and proxies `/api` requests to `http://localhost:8888`.

You can override the API target.

PowerShell:

```powershell
$env:OXGRAPH_API_URL = "http://localhost:8890"
pnpm run dev:ui
```

Bash:

```bash
OXGRAPH_API_URL=http://localhost:8890 pnpm run dev:ui
```

You can override the CLI server port.

PowerShell:

```powershell
$env:OXGRAPH_PORT = "8890"
pnpm run oxgraph -- --file "C:/path/to/project/src"
```

Bash:

```bash
OXGRAPH_PORT=8890 pnpm run oxgraph -- --file "C:/path/to/project/src"
```

## Graph Data Contract

The Rust core returns graph data in a React Flow-compatible shape:

```json
{
  "nodes": [
    {
      "id": "C:\\path\\to\\src\\main.tsx",
      "type": "custom",
      "data": {
        "label": "main.tsx",
        "path": "C:\\path\\to\\src\\main.tsx",
        "kind": "entry",
        "status": "resolved",
        "isEntry": true
      }
    }
  ],
  "edges": [
    {
      "id": "source->target",
      "source": "source",
      "target": "target",
      "data": {
        "specifier": "./App",
        "isCircular": false,
        "unresolved": false
      }
    }
  ],
  "issues": []
}
```

Semantic metadata lives under `data`. The root-level `type` field is reserved for React Flow and is set to `custom`.

## Useful Commands

```bash
pnpm --filter @oxgraph/core run build
pnpm --filter @oxgraph/core run dev
pnpm --filter @oxgraph/ui run build
pnpm --filter @oxgraph/cli run build
pnpm run build
pnpm run oxgraph -- --file "C:/path/to/project/src"
pnpm run oxgraph:build -- --file "C:/path/to/project/src"
```

## Current Status

oxgraph is in MVP development. The current implementation can build and visualize dependency graphs, but the package layout, CLI flags, and UI may still change before a stable release.

## License

GNU GPLv3. See [LICENSE](./LICENSE).
