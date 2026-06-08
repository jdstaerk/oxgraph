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
| **Lint** | `pnpm run lint` | `pnpm run lint:cli` |
| **Format** | `pnpm run format` | `pnpm run format:core` |

## Testing

Run all tests across the monorepo:

```bash
pnpm run test
```

This executes:
- **Rust Core:** `cargo test` (AST and graph logic)
- **UI:** `vitest` (Layouting and component logic)
- **CLI:** `vitest` (API integration tests)

## License

GNU GPLv3. See [LICENSE](./LICENSE).
