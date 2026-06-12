# oxgraph

<p align="center">
  <strong>Fast codebase maps for JavaScript and TypeScript projects.</strong><br />
  Rust-powered dependency and call graph analysis with an interactive React Flow UI.
</p>

<p align="center">
  <a href="https://github.com/jdstaerk/oxgraph/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/jdstaerk/oxgraph/actions/workflows/ci.yml/badge.svg" /></a>
  <a href="https://www.npmjs.com/package/@oxgraph/cli"><img alt="npm" src="https://img.shields.io/npm/v/@oxgraph/cli?color=0ea5e9" /></a>
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-blue.svg" /></a>
  <img alt="Node" src="https://img.shields.io/badge/node-%3E%3D22.13-339933" />
</p>

<p align="center">
  <a href="https://jdstaerk.github.io/oxgraph/">Live demo</a>
  ·
  <a href="#quick-start">Quick start</a>
  ·
  <a href="#local-development">Local development</a>
  ·
  <a href="#architecture">Architecture</a>
</p>

oxgraph turns a codebase into a browsable architecture graph. Point it at a JavaScript or TypeScript project and it starts a local UI where you can inspect imports, unresolved modules, function calls, and React component render paths.

## Why oxgraph

Most JavaScript graphing tools keep parsing and analysis in Node.js. oxgraph moves the expensive work into a native Rust engine built on the Oxc ecosystem, then sends only a compact React Flow payload to the browser.

- Fast dependency graphs for JS, JSX, TS, and TSX source files.
- Call graphs for functions, methods, arrow functions, and React component usage.
- TypeScript path alias and Node-style module resolution through `oxc_resolver`.
- Noise reduction for framework internals and third-party packages.
- Interactive UI with search, focus depth, ghost nodes, issues, minimap, and raw JSON view.
- Static demo mode for GitHub Pages or any static host.

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

Useful runtime options:

| Option | Description |
| --- | --- |
| `--file <path>`, `-f <path>` | Analyze a specific entry file. Positional paths also work, for example `npx @oxgraph/cli@latest src/main.tsx`. |
| `--no-open` | Start the server without opening a browser. |
| `--api-only` | Serve only the JSON API endpoints. Useful with the Vite UI dev server. |
| `OXGRAPH_PORT=3000` | Override the default server port. |

For repeated use, a global install is optional:

```bash
npm install -g @oxgraph/cli
oxgraph .
```

## Live Demo

The live demo is a static Vite build. It uses checked-in sample graph data and does not run Rust analysis or read visitor files in the browser.

```bash
# Run the static demo locally
pnpm run dev:demo

# Build the static demo into packages/ui/dist
pnpm run build:demo
```

`build:demo` creates plain HTML, CSS, and JS with demo data bundled into the app. GitHub Pages serves those static files without a Node server or port. The `5173` port is only used by `dev:demo` for local Vite preview and hot reload.

This repository also includes `.github/workflows/pages.yml`, which builds the demo and deploys `packages/ui/dist` to GitHub Pages on pushes to `main`.

## Local Development

Clone the repo and install the workspace:

```bash
git clone https://github.com/jdstaerk/oxgraph.git
cd oxgraph
corepack enable
pnpm install
```

Build every package:

```bash
pnpm run build
```

Run the locally built CLI against the current repository:

```bash
pnpm run oxgraph -- .
```

Start the workspace development mode:

```bash
pnpm run dev
```

That compiles the Rust core in debug mode, starts the CLI API server against the repository root, and starts the Vite UI. Open `http://localhost:5173` for the dev UI; the API runs on `http://localhost:8888`.

To analyze a different target in dev mode, pass CLI arguments after `--`:

```bash
pnpm run dev -- --file path/to/main.tsx
pnpm run dev -- path/to/project
```

Command reference:

| Command | Purpose |
| --- | --- |
| `pnpm run dev` | Fast local development: debug native build, API server, and Vite UI. Defaults to analyzing `.`. |
| `pnpm run dev -- --file src/main.tsx` | Same dev servers, but analyzes a specific file. |
| `pnpm run build` | Full release/package build. This can take a while because it compiles the Rust native addon in release mode. |
| `pnpm run oxgraph -- .` | Run the already-built local CLI against the current directory. |
| `pnpm run oxgraph:build -- .` | Run the full build first, then run the local CLI. |

The CLI analyzes the path you pass after `--`. If no path is passed, it uses the current working directory.

## Quality Checks

```bash
pnpm run type-check
pnpm run lint
pnpm run test
pnpm run format:check
```

The current validation pipeline uses TypeScript, Cargo tests, Vitest, `cargo clippy`, and `oxlint`.

## Monorepo Layout

```text
oxgraph/
├── packages/
│   ├── core/      # Rust parser, resolver, graph builder, and NAPI bindings
│   ├── cli/       # Node.js CLI, local HTTP server, and packaged UI assets
│   └── ui/        # Vite + React + React Flow graph interface
├── .github/
│   └── workflows/ # CI, release, and static demo deployment
└── README.md
```

## Architecture

### `@oxgraph/core`

The native Rust engine parses source files with Oxc, resolves imports, builds dependency and call graph models, and exposes NAPI bindings for Node.js.

### `@oxgraph/cli`

The CLI calls the native engine, starts a local HTTP server, serves the bundled UI, and exposes graph data at:

- `/api/graph-data/dependencies`
- `/api/graph-data/call-graph`

### `@oxgraph/ui`

The React UI fetches graph payloads, lays them out with ELK/React Flow, and provides search, focus, issue inspection, ghost-node visibility, and raw JSON views.

The graph payload is intentionally small:

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
        "unresolved": false
      }
    }
  ],
  "issues": []
}
```

## Limitations

oxgraph performs static analysis. It does not execute your code, so highly dynamic patterns can be incomplete:

- Runtime-generated imports or property access, such as `window[name]()`, cannot be fully resolved.
- Complex dependency injection, HOCs, and metaprogramming may produce disconnected nodes.
- The strongest results come from explicit ESM imports, TypeScript path aliases, direct calls, and standard React component usage.

## License

MIT. See [LICENSE](./LICENSE).
