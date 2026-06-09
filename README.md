# oxgraph

oxgraph is a codebase visualization tool for modern JavaScript and TypeScript projects. It analyzes a project with a native Rust backend and renders the result as an interactive graph in the browser.

The project currently focuses on two views:

- **Dependency Graph**: how files and modules depend on each other.
- **Call Graph**: how functions, methods, and React components call or render each other.

oxgraph is especially useful for React codebases today. In addition to normal function calls, the call graph treats JSX component usage such as `<AddItemForm />` as a component call, while filtering out native HTML tags and most external framework noise.

## Project Status

oxgraph is in active MVP development. The current implementation is already able to analyze local projects, resolve internal imports, generate dependency graphs, and build a best-effort call graph. APIs, CLI flags, and output formats may still change before a stable release.

## Why oxgraph?

Most JavaScript tooling builds on top of Node.js parsers and moves large intermediate structures through the JavaScript runtime. oxgraph takes a different approach:

- Parsing and semantic analysis happen in Rust.
- The full AST stays inside the Rust process.
- Only compact graph data is sent to Node.js and the browser.
- The UI receives a React Flow-compatible `{ nodes, edges, issues }` payload.

This keeps the runtime boundary small and makes the tool suitable for fast local architecture exploration.

## Features

- Fast parsing with the Oxidation Compiler ecosystem (`oxc`)
- File dependency graph generation
- Best-effort function and method call graph generation
- JSX component usage detection for React projects
- Internal import and re-export resolution
- TypeScript path alias support through resolver configuration
- Domain-only call graph filtering to reduce framework and native API noise
- Interactive React Flow UI
- Automatic graph layout with ELK
- Search, focus mode, raw JSON view, and issue reporting

## Installation

```bash
pnpm install
```

Build the project before running the CLI:

```bash
pnpm run build
```

## Usage

Analyze a project or source directory:

```bash
pnpm run oxgraph -- --file "C:/path/to/project/src"
```

When a directory is passed, oxgraph treats it as the analysis scope and scans supported JavaScript and TypeScript source files below that directory. This is intentionally framework-neutral: Vite apps, Next.js apps, libraries, and custom project layouts are handled through the same directory-scan behavior.

Analyze a specific entry file:

```bash
pnpm run oxgraph -- --file "C:/path/to/project/src/main.tsx"
```

When a file is passed, oxgraph starts from that file and follows its reachable imports.

For a fresh checkout, or after changing the Rust core or UI, use:

```bash
pnpm run oxgraph:build -- --file "C:/path/to/project/src"
```

The CLI starts a local server and opens the browser automatically. By default, the server runs on `http://localhost:8888`.

## Development

Run the full development setup:

```bash
pnpm run dev
```

Run individual checks:

```bash
pnpm run type-check
pnpm run lint
pnpm run test
pnpm run format:check
```

Build everything:

```bash
pnpm run build
```

## Monorepo Layout

```text
packages/
  core/   Rust parser, resolver, graph builder, and NAPI export
  cli/    Node CLI and local web server
  ui/     Vite + React Flow frontend
```

## Architecture

oxgraph is split into three packages with a narrow data contract between each layer.

### `@oxgraph/core`

The core package is written in Rust. It is responsible for parsing, resolving, and graph generation.

Key responsibilities:

- Parse JavaScript, TypeScript, JSX, and TSX files with `oxc`.
- Extract static imports, dynamic imports, re-exports, `export *`, and CommonJS `require(...)`.
- Resolve module paths through `oxc_resolver`.
- Build a recursive file dependency graph from an entry file or source directory.
- Use `oxc_semantic` for call graph analysis.
- Resolve local function calls, class methods, internal imports, re-exports, and JSX component usage.
- Filter out external package calls and unresolved native/member calls that do not help explain project-specific logic.

The AST does not leave Rust. The exported NAPI functions return compact graph data:

```json
{
  "nodes": [],
  "edges": [],
  "issues": []
}
```

### `@oxgraph/cli`

The CLI package is a thin Node.js layer around the native Rust core.

Key responsibilities:

- Parse CLI arguments.
- Call the native Rust graph extraction functions through NAPI.
- Start a local HTTP server.
- Serve the built UI.
- Expose graph data through local API endpoints.

The CLI currently serves both the browser app and the graph API from one local process.

### `@oxgraph/ui`

The UI package is a Vite React application using React Flow.

Key responsibilities:

- Fetch graph data from the local CLI server.
- Run ELK layouting in the browser.
- Render dependency graphs and call graphs.
- Provide search, focus mode, issue display, raw JSON inspection, and graph navigation.

The UI does not access the filesystem directly. It only consumes the graph JSON returned by the CLI API.

## Graph Data Contract

Nodes and edges are shaped for React Flow. Application-specific metadata lives under `data`.

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

## Limitations

The call graph is intentionally best-effort. JavaScript and TypeScript allow highly dynamic call patterns that cannot always be resolved statically. oxgraph currently focuses on practical project-level insight:

- direct function calls
- class methods where they can be resolved confidently
- local declarations
- internal imports and re-exports
- React JSX component usage

Dynamic dispatch, runtime-generated functions, dependency injection containers, and complex framework conventions may not be fully represented.

## Tooling

The repository uses the Oxidation Compiler ecosystem where possible:

- Rust checks through Cargo, Clippy, and Rustfmt
- TypeScript type checking with `tsc`
- JavaScript/TypeScript linting and formatting through `oxlint`

## License

GNU GPLv3. See [LICENSE](./LICENSE).
