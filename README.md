# oxgraph

oxgraph is a real-time codebase dependency visualizer. It parses JavaScript and TypeScript projects with a Rust backend, resolves imports on the native side, and renders the resulting dependency graph in a React Flow UI.

The current MVP focuses on fast file dependency extraction. The Rust core keeps the AST inside Rust and only sends compact graph data to Node.js and the browser.

## Features

- Rust-powered parsing with `oxc`
- Import extraction for:
  - static ESM imports
  - dynamic imports
  - named re-exports
  - `export *`
  - CommonJS `require(...)`
- Path resolution through `oxc_resolver`
- Recursive dependency graph traversal
- React Flow graph rendering
- ELK-based automatic layout
- Raw JSON developer view
- Focus mode for inspecting related files
- NAPI-RS bridge from Rust to Node.js

## Monorepo Layout

```text
packages/
  core/   Rust parser, resolver, graph builder, and NAPI export
  cli/    Node CLI and local web server wrapper
  ui/     Vite + React Flow frontend
```

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
pnpm run oxgraph -- --file "C:/path/to/project/src"
```

You can also pass a single entry file:

```bash
pnpm run oxgraph -- --file "C:/path/to/project/src/main.tsx"
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
```

## Current Status

oxgraph is in MVP development. The current implementation can build and visualize dependency graphs, but the package layout, CLI flags, and UI may still change before a stable release.

## License

GNU GPLv3. See [LICENSE](./LICENSE).
