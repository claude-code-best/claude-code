#!/usr/bin/env bun
/**
 * Dev entrypoint — launches cli.tsx with MACRO.* defines injected
 * via Bun's -d flag (bunfig.toml [define] doesn't propagate to
 * dynamically imported modules at runtime).
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getMacroDefines } from "./defines.ts";

// Resolve project root from this script's location
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");
const cliPath = join(projectRoot, "src/entrypoints/cli.tsx");

const defines = getMacroDefines();

const defineArgs = Object.entries(defines).flatMap(([k, v]) => [
    "-d",
    `${k}:${v}`,
]);

// Bun --feature flags: enable feature() gates at runtime.
// Default features enabled in dev mode.
const DEFAULT_FEATURES = [
  "BUDDY", "TRANSCRIPT_CLASSIFIER", "BRIDGE_MODE",
  "AGENT_TRIGGERS_REMOTE", "CHICAGO_MCP", "VOICE_MODE",
  "SHOT_STATS", "PROMPT_CACHE_BREAK_DETECTION", "TOKEN_BUDGET",
  // P0: local features
  "AGENT_TRIGGERS",
  "ULTRATHINK",
  "BUILTIN_EXPLORE_PLAN_AGENTS",
  "LODESTONE",
  // P1: API-dependent features
  "EXTRACT_MEMORIES", "VERIFICATION_AGENT",
  "KAIROS_BRIEF", "AWAY_SUMMARY", "ULTRAPLAN",
  // P2: daemon + remote control server
  "DAEMON",
];

// Any env var matching FEATURE_<NAME>=1 will also enable that feature.
// e.g. FEATURE_PROACTIVE=1 bun run dev
const envFeatures = Object.entries(process.env)
    .filter(([k]) => k.startsWith("FEATURE_"))
    .map(([k]) => k.replace("FEATURE_", ""));

const allFeatures = [...new Set([...DEFAULT_FEATURES, ...envFeatures])];
const featureArgs = allFeatures.flatMap((name) => ["--feature", name]);

// If BUN_INSPECT is set, pass --inspect-wait to the child process
const inspectArgs = process.env.BUN_INSPECT
    ? ["--inspect-wait=" + process.env.BUN_INSPECT]
    : [];

const result = Bun.spawnSync(
    ["bun", ...inspectArgs, "run", ...defineArgs, ...featureArgs, cliPath, ...process.argv.slice(2)],
    { stdio: ["inherit", "inherit", "inherit"], cwd: projectRoot },
);

process.exit(result.exitCode ?? 0);
