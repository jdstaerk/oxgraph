#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const rawCliArgs = process.argv.slice(2);
const cliArgs = rawCliArgs[0] === "--" ? rawCliArgs.slice(1) : rawCliArgs;
const targetArgs = cliArgs.length > 0 ? cliArgs : ["."];

function runStep(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function startProcess(name, command, args) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: false,
  });

  child.once("exit", (code, signal) => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    stopProcesses();

    if (signal) {
      console.error(`${name} exited with signal ${signal}`);
      process.exit(1);
    }

    process.exit(code ?? 0);
  });

  return child;
}

let isShuttingDown = false;
const runningProcesses = [];

function stopProcesses() {
  for (const child of runningProcesses) {
    if (!child.killed) {
      child.kill("SIGINT");
    }
  }
}

process.once("SIGINT", () => {
  isShuttingDown = true;
  stopProcesses();
});

process.once("SIGTERM", () => {
  isShuttingDown = true;
  stopProcesses();
});

runStep(pnpm, ["--filter", "@oxgraph/core", "run", "dev"]);
runStep(pnpm, ["--filter", "@oxgraph/cli", "exec", "tsc", "-p", "tsconfig.json"]);

runningProcesses.push(
  startProcess("oxgraph API", "node", [
    "packages/cli/dist/bin/oxgraph.js",
    ...targetArgs,
    "--api-only",
    "--no-open",
  ]),
);
runningProcesses.push(
  startProcess("oxgraph UI", pnpm, ["--filter", "@oxgraph/ui", "run", "dev"]),
);
