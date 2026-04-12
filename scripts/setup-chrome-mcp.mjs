#!/usr/bin/env node

/**
 * Unified Chrome MCP setup script.
 *
 * Usage:
 *   node scripts/setup-chrome-mcp.mjs           # Run full setup (fix-permissions → register → doctor)
 *   node scripts/setup-chrome-mcp.mjs doctor    # Run a single sub-command
 */

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const cliPath = require.resolve("mcp-chrome-bridge/dist/cli.js");

const userArgs = process.argv.slice(2);

if (userArgs.length > 0) {
  // Forward single sub-command
  execFileSync("node", [cliPath, ...userArgs], { stdio: "inherit" });
} else {
  // Full setup sequence
  const steps = [
    ["fix-permissions"],
    ["register", "--browser", "chrome"],
    ["doctor"],
  ];

  for (let i = 0; i < steps.length; i++) {
    const args = steps[i];
    const isLast = i === steps.length - 1;
    if (isLast) console.log(`\n[${i + 1}/${steps.length}] ${args.join(" ")}`);
    execFileSync("node", [cliPath, ...args], { stdio: isLast ? "inherit" : "pipe" });
  }

  console.log("\nChrome MCP setup complete!");
}
