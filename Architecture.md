# oxgraph Architecture

Welcome to the `oxgraph` project! This document serves as the primary onboarding guide for new contributors, detailing the high-level architecture and the technical decisions that drive our high-performance codebase visualization tool.

## The Separation of Concerns

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

## Ecosystem Rules

**CRITICAL RULE:** This repository strictly avoids traditional Node.js tooling overhead.
- We do **NOT** use ESLint or Prettier.
- We live entirely within the Oxidation Compiler ecosystem.
- Linting and basic code formatting are performed via **`oxlint`** (using the `--fix` flag).

Welcome aboard, and happy coding!
