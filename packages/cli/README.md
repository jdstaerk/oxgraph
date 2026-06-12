# @oxgraph/cli

<p align="center">
  <strong>Fast codebase maps for JavaScript and TypeScript projects.</strong><br />
  Rust-powered dependency and call graph analysis with an interactive React Flow UI.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@oxgraph/cli"><img alt="npm" src="https://img.shields.io/npm/v/@oxgraph/cli?color=0ea5e9" /></a>
  <a href="https://github.com/jdstaerk/oxgraph/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/jdstaerk/oxgraph/actions/workflows/ci.yml/badge.svg" /></a>
  <a href="https://github.com/jdstaerk/oxgraph/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-blue.svg" /></a>
  <img alt="Node" src="https://img.shields.io/badge/node-%3E%3D22.13-339933" />
</p>

<p align="center">
  <a href="https://jdstaerk.github.io/oxgraph/">Live demo</a>
  |
  <a href="#quick-start">Quick start</a>
  |
  <a href="https://github.com/jdstaerk/oxgraph">Repository</a>
</p>

`@oxgraph/cli` turns a codebase into a browsable architecture graph. Point it at a JavaScript or TypeScript project and it starts a local UI where you can inspect imports, unresolved modules, function calls, and React component render paths.

## Quick Start

You only need Node.js 22.13 or newer. For one-off use, do not install anything globally:

```bash
# Analyze the current repository
npx @oxgraph/cli@latest .

# Or use pnpm's dlx runner
pnpm dlx @oxgraph/cli .
```

The CLI analyzes the target, starts a local web server, and opens the graph UI. By default it starts at `http://localhost:8888`; if that port is busy, oxgraph tries the next available ports.

To start from a specific file instead of scanning a whole directory:

```bash
npx @oxgraph/cli@latest --file src/main.tsx
```

For repeated use, a global install is optional:

```bash
npm install -g @oxgraph/cli
oxgraph .
```

## Live Demo

Try the static demo at <https://jdstaerk.github.io/oxgraph/>.

The demo uses checked-in sample graph data. It does not run Rust analysis or read visitor files in the browser. Install and run the CLI when you want to analyze your own repository.

## Options

| Option | Description |
| --- | --- |
| `--file <path>`, `-f <path>` | Analyze a specific entry file. Positional paths also work, for example `npx @oxgraph/cli@latest src/main.tsx`. |
| `--no-open` | Start the server without opening a browser. |
| `--api-only` | Serve only the JSON API endpoints. Useful with the Vite UI dev server. |
| `OXGRAPH_PORT=3000` | Override the default server port. |

## What You Get

- Fast dependency graphs for JS, JSX, TS, and TSX source files.
- Call graphs for functions, methods, arrow functions, and React component usage.
- TypeScript path alias and Node-style module resolution through `oxc_resolver`.
- Noise reduction for framework internals and third-party packages.
- Interactive UI with search, focus depth, ghost nodes, issues, minimap, and raw JSON view.

## API Endpoints

When the local server is running, graph data is exposed as JSON:

- `/api/graph-data/dependencies`
- `/api/graph-data/call-graph`
- `/api/graph-data/call-graph?entryFunction=App`

Use `--api-only` if you only want these endpoints and do not need the packaged UI.

## Architecture

The CLI is a thin bridge around [`@oxgraph/core`](https://www.npmjs.com/package/@oxgraph/core):

- `@oxgraph/core` owns parsing, semantic analysis, import resolution, and graph extraction in Rust.
- `@oxgraph/cli` normalizes CLI options, calls the native engine, starts the HTTP server, and serves the bundled UI.
- `@oxgraph/ui` renders the serialized graph payload with React Flow and ELK layout.

The AST never crosses into Node.js or the browser. The CLI passes through compact node, edge, metadata, and issue payloads.

## Limitations

oxgraph performs static analysis. It does not execute your code, so highly dynamic patterns can be incomplete:

- Runtime-generated imports or property access, such as `window[name]()`, cannot be fully resolved.
- Complex dependency injection, HOCs, and metaprogramming may produce disconnected nodes.
- The strongest results come from explicit ESM imports, TypeScript path aliases, direct calls, and standard React component usage.

## Repository

- Source: <https://github.com/jdstaerk/oxgraph>
- Issues: <https://github.com/jdstaerk/oxgraph/issues>
- License: MIT
