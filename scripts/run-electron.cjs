#!/usr/bin/env node

const { spawn } = require("node:child_process");

function main() {
  const electronBinary = require("electron");
  const forwardArgs = [];
  let forceProd = false;

  for (const arg of process.argv.slice(2)) {
    if (arg === "--force-prod") {
      forceProd = true;
      continue;
    }
    forwardArgs.push(arg);
  }

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  if (forceProd) {
    env.ML_CLIENT_FORCE_PROD = "1";
  }

  const child = spawn(
    electronBinary,
    forwardArgs.length > 0 ? forwardArgs : ["."],
    {
      stdio: "inherit",
      env,
      windowsHide: false,
    },
  );

  child.once("error", (error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[run-electron] Failed to start Electron: ${message}`);
    process.exit(1);
  });

  child.once("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

main();
