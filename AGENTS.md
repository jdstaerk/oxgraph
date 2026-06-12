# AI Agent Guidelines

This file is the architectural compass for AI agents working in the oxgraph workspace. Read it before proposing changes or writing code. Keep changes aligned with the system boundaries, tooling constraints, and call graph rules documented here.

---

## System Architecture Overview

oxgraph is a decoupled monorepo organized around three distinct layers. Each layer has a narrow responsibility and must avoid leaking implementation concerns into adjacent layers.

### Core Layer: `packages/core`

The core layer is the native Rust engine. It owns source parsing, semantic analysis, reference tracking, call graph extraction, and graph payload generation.

- Use the `oxc` ecosystem for high-speed JavaScript and TypeScript parsing.
- Use `oxc_semantic` for symbol and reference tracking.
- Export the public runtime surface through NAPI-RS.
- Keep parsing and semantic complexity inside Rust.
- Serialize only the final graph payload required by downstream layers.

### Bridge Layer: `packages/cli`

The bridge layer is the Node.js wrapper around the native engine. It is responsible for command-line ergonomics and local serving, not for code analysis.

- Parse CLI arguments and normalize execution options.
- Invoke the NAPI-backed core package.
- Host the local HTTP server used to serve the static frontend.
- Pass through serialized graph data without recreating core analysis logic.
- Avoid embedding AST, symbol-resolution, or call-graph domain logic in Node.js.

### Presentation Layer: `packages/ui`

The presentation layer is the React application. It owns graph visualization, user interaction, and layout presentation.

- Use React for the application interface.
- Use React Flow for graph rendering and interaction primitives.
- Use `elkjs` for Directed Acyclic Graph layout execution.
- Treat the graph payload as an input contract from the lower layers.
- Do not parse source files or infer semantic code relationships in the UI.

---

## Strict Guardrails and Tooling Constraints

### Code Quality Tooling

This workspace lives within the Oxidation Compiler ecosystem for linting and formatting.

- Use `oxlint` for JavaScript and TypeScript linting.
- Use the `oxc` formatter for code styling.
- Do not introduce ESLint, Prettier, or their configuration files.
- Do not add `.eslintrc`, `eslint.config.*`, `.prettierrc`, `prettier.config.*`, or equivalent configuration files.
- Do not solve formatting or linting issues by adding unrelated tooling.

### AST Encapsulation

The full Abstract Syntax Tree must stay entirely within Rust memory.

- The AST must never cross the FFI boundary into Node.js.
- Node.js must not receive, inspect, transform, or persist raw AST structures.
- The UI must never depend on parser-specific AST shapes.
- The only data allowed to cross from the core layer is a lean, flat, serialized graph payload matching the React Flow-compatible schema.
- Serialized payloads must contain only the node, edge, metadata, and issue fields required by the frontend contract.

### Data Contract Integrity

Graph transformation utilities must preserve layer boundaries and schema clarity.

- Keep node, edge, and issue schemas explicit and stable.
- Do not mix parsing concerns into presentation utilities.
- Do not mix rendering concerns into the Rust graph extraction engine.
- Prefer narrow, typed payloads over broad transport objects.
- Any schema change must be reflected across the core, CLI, UI, and tests.

---

## Call Graph Core Logic

The call graph engine is domain-focused. Its purpose is to reveal meaningful internal code relationships, not to render every syntactic call expression.

### Domain Focus

Only map functional symbols that resolve to internal workspace code.

- Include function declarations.
- Include arrow-function declarations assigned to internal symbols.
- Include methods declared inside internal classes or object structures.
- Include symbols resolved through internal cross-file imports.
- Exclude unresolved calls unless they can be proven to represent internal workspace declarations.

### Noise Reduction

Discard implementation noise that does not represent domain-level ownership.

- Ignore calls originating from third-party npm modules.
- Do not generate graph edges for external framework utilities.
- Ignore standard native JavaScript prototype methods such as `.map()`, `.filter()`, `.reduce()`, `.trim()`, `.split()`, and similar built-ins.
- Avoid promoting library hooks, rendering helpers, or runtime utilities into domain graph nodes unless they resolve to internal declarations.

### JSX Handling

JSX must follow the same domain-resolution rules as standard calls.

- Treat capitalized JSX opening elements as functional call edges.
- Resolve the JSX identifier symbol before creating an edge.
- Create JSX-derived edges only when the symbol resolves to an internal declaration or internal cross-file import.
- Ignore lowercase JSX elements because they represent native HTML elements.

### Cleanliness

The final graph payload must remain visually meaningful.

- After edge filtering, run orphan pruning.
- Remove functional nodes with zero incoming and zero outgoing edges.
- Remove unconnected nodes that do not contribute to the final visualization.
- Preserve issue reporting separately from graph cleanliness when diagnostics are still useful.

---

## Quality and Testing Pipeline

Testing is a core pillar of maintainability. Before declaring work complete, run the validation path that matches the affected layers, then run the full workspace pipeline when practical.

### Rust Core

Use Cargo tests for internal parsing, semantic-resolution, and graph-extraction logic.

```sh
cargo test
```

- Run from `packages/core` when validating the Rust engine directly.
- Prefer in-memory source strings for parser and AST-related tests.
- Do not read or write physical test files unless filesystem behavior is the subject of the test.

### CLI Package

Use Vitest for the Node.js bridge layer.

```sh
pnpm --filter @oxgraph/cli run test
```

- Validate CLI argument handling, NAPI invocation boundaries, server behavior, and payload transport.
- Do not duplicate Rust parsing assertions in CLI tests.

### UI Package

Use Vitest for the React presentation layer.

```sh
pnpm --filter @oxgraph/ui run test
```

- Validate graph utilities, layout behavior, rendering contracts, and user-facing state transitions.
- Keep tests focused on the serialized payload contract rather than AST internals.

### Workspace Validation

Run the complete test suite from the repository root before considering cross-layer work complete.

```sh
pnpm test
```

This command runs the repository test suites through the workspace scripts and is the final validation path for changes that affect multiple packages.
