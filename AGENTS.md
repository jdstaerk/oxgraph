# AI Agent Guidelines

This file contains the foundational architectural context, style constraints, and high-level guardrails for working on the oxgraph workspace. Read and parse this entirely before proposing changes or writing code.

---

## System Architecture and Stack

oxgraph is built as a highly decoupled, clean monorepo designed for long-term maintainability:
- **packages/core**: Native Rust engine utilizing the oxc ecosystem for parsing and reference tracking. Compiles into a native Node binary via NAPI-RS.
- **packages/cli**: Node.js wrapper that invokes the native core binary, parses CLI arguments, and hosts a local HTTP server to serve the static frontend.
- **packages/ui**: React canvas application utilizing reactflow and elkjs for complex DAG (Directed Acyclic Graph) layout execution.

---

## Strict Guardrails and Tooling Constraints

1. **No ESLint / No Prettier**: We rely entirely on the Oxidation Compiler ecosystem to maintain a fast, clean codebase. Use oxlint for linting and the oxc formatter for code styling. Do not introduce configuration files for other linting or formatting tools.
2. **Encapsulated AST**: The Abstract Syntax Tree must never cross the boundary into Node.js. The Rust core must encapsulate all parsing complexity and serialize only a lean, flat, React Flow-compatible JSON payload. This keeps the layer boundary clean.
3. **Data Contract Integrity**: Ensure all graph transformation utilities maintain the strict node, edge, and issue schemas required by the frontend application without mixing concerns.

---

## Call Graph Core Rules (Domain-Only Logic)

When modifying or expanding the call graph extraction engine in packages/core, you must strictly respect the noise-reduction pipeline:

- **Internal Scope Focus**: Only map function, arrow-function, or method symbols that resolve to internal workspace declarations or internal cross-file imports.
- **Discard Framework Clutter**: Aggressively discard calls originating from third-party npm modules. Do not generate edges for underlying framework utilities.
- **Discard Native Members**: Ignore standard JavaScript prototype methods.
- **JSX Resolution**: Treat capitalized JSX opening elements exactly like a standard domain function call edge. Resolve its identifier symbol. Ignore lowercase native HTML elements.
- **Orphan Pruning**: After filtering edges, strip out any functional node that contains zero incoming and zero outgoing connections to preserve graph cleanliness and readability.

---

## Testing and Quality Workflow

Maintainability is a core pillar of this project. Before declaring a task complete, verify that the quality pipeline passes:
- **Rust Core**: Run cargo test. Use in-memory string parsing for AST verification; do not read or write physical test files to the disk unless absolutely necessary.
- **Frontend and CLI**: Run vitest inside their respective package directories.
- **Workspace Validation**: Run pnpm test from the root directory to execute all test suites across the monorepo concurrently.
