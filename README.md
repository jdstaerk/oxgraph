# oxgraph

**oxgraph** is a fast, real-time codebase dependency visualizer and call graph generator designed for modern JavaScript and TypeScript projects. 

It leverages the Oxidation Compiler suite (`oxc`) in a native Rust backend to statically analyze your codebase at incredible speeds, providing interactive, visual maps of your file dependencies and function call paths.

## Usage

To analyze a project or source directory:

```bash
# Build the project
pnpm run build

# Run oxgraph on a directory
pnpm run build && node packages/cli/dist/bin/oxgraph.js --file "C:/path/to/project/src"
```

You can also pass a single entry file to start the analysis from a specific point:

```bash
node packages/cli/dist/bin/oxgraph.js --file "C:/path/to/project/src/main.tsx"
```

The CLI starts a local server (default: `http://localhost:8888`) and opens the interactive UI in your browser.

## Features

- **Lightning-Fast Parsing:** Powered by a Rust backend using `oxc` for AST extraction.
- **Dependency Graphs:** Map ESM imports, dynamic imports, re-exports, and CommonJS.
- **Call Graph Generation:** Trace function and method calls starting from a specific entry point.
- **Interactive UI:** Responsive React Flow dashboard with automatic ELK-based layouting.
- **Intelligent Pruning:** Filters noisy framework code and prunes isolated nodes for clarity.

## Development

Oxgraph is a monorepo managed with `pnpm`. To set up the development environment:

```bash
# Install dependencies
pnpm install

# Start the unified development environment
# This builds the core and starts the UI (Vite) and CLI (API) in parallel
pnpm run dev
```

### Script Architecture

The project uses a structured script pattern across all packages (`core`, `ui`, `cli`). Each command can be run globally or for a specific package.

| Command | Root (Global) | Package Specific (Example) |
| :--- | :--- | :--- |
| **Build** | `pnpm run build` | `pnpm run build:core` |
| **Test** | `pnpm run test` | `pnpm run test:ui` |
| **Type Check** | `pnpm run type-check` | `pnpm run type-check:cli` |
| **Lint** | `pnpm run lint` | `pnpm run lint:cli` |
| **Format (Fix)** | `pnpm run format:fix` | `pnpm run format:fix:core` |
| **Format (Check)** | `pnpm run format:check` | `pnpm run format:check:ui` |

## Testing

Run all tests across the monorepo:

```bash
pnpm run test
```

This executes:
- **Rust Core:** `cargo test` (AST and graph logic)
- **UI:** `vitest` (Layouting and component logic)
- **CLI:** `vitest` (API integration tests)

## Architecture

`oxgraph` is structured as a monorepo consisting of three distinct packages, each heavily specialized for its specific task. This architecture ensures maximum performance during static analysis while maintaining a responsive, decoupled web UI.

### 1. `@oxgraph/core` (The Rust Backend)

The core engine of `oxgraph` is written entirely in **Rust** to achieve maximum execution speed and completely bypass Node.js memory limits during AST generation.

- **Oxidation Compiler (`oxc`)**: We leverage the incredible speed of `oxc` to parse JavaScript and TypeScript files.
- **Domain-Only Call Graph**: We do not just build a pure AST map. By utilizing `oxc_semantic`, the core engine actively resolves function references and builds a structured, "Domain-Only" Call Graph. This approach filters out noisy framework/library calls and isolates the core domain logic, providing highly actionable architectural insights.
- **NAPI-RS Bridge**: The finalized graph objects (nodes, edges, issues) are highly compacted and serialized back into the Node.js runtime using **NAPI-RS**. This allows the TypeScript CLI to interact with native Rust functions without serializing massive AST payloads over IPC.

### 2. `@oxgraph/cli` (The CLI & Server)

The CLI acts as the orchestrator and local server for the application.

- **Pre-build & Serve Pattern**: Instead of running a complex dynamic web server, the CLI serves pre-built UI static files (from the `public-ui` folder) through a lightweight Node `http` server. 
- **Decoupled Architecture**: This entirely decouples the frontend from the Node/Rust backend. When a user runs the CLI against a codebase, it triggers the Rust core to calculate the data, spins up the server, and serves both the React application and the API endpoints (e.g., `/api/call-graph-data`) simultaneously.

### 3. `@oxgraph/ui` (The Frontend)

The visualization dashboard is a React Single Page Application (SPA) designed to handle large, complex graphs seamlessly.

- **React Flow**: The core canvas library for rendering the interactive Directed Acyclic Graphs (DAG).
- **Layouting with `elkjs`**: To solve the notorious "hairball" problem that plagues large graph visualizations, we rely on `elkjs`. We combine it with strict Port Constraints (enforcing West-to-East node handles) to ensure a highly readable, organized left-to-right flow. 
- **Decoupled Data Consumption**: The UI assumes no direct knowledge of the filesystem; it merely consumes the structured JSON provided by the CLI's API server.

### Ecosystem Rules

This repository strictly avoids traditional Node.js tooling overhead.
- We do **NOT** use ESLint or Prettier.
- We live entirely within the Oxidation Compiler ecosystem.
- Linting and basic code formatting are performed via **`oxlint`** (using the `--fix` flag).

## License

GNU GPLv3. See [LICENSE](./LICENSE).
