#!/usr/bin/env bun
/**
 * Dev entrypoint — launches cli.tsx with MACRO.* defines injected
 * via Bun's -d flag (bunfig.toml [define] doesn't propagate to
 * dynamically imported modules at runtime).
 */
import { getMacroDefines } from "./defines.ts";

const defines = getMacroDefines();

const defineArgs = Object.entries(defines).flatMap(([k, v]) => [
    "-d",
    `${k}:${v}`,
]);

const result = Bun.spawnSync(
    ["bun", "run", ...defineArgs, "src/entrypoints/cli.tsx", ...process.argv.slice(2)],
    { stdio: ["inherit", "inherit", "inherit"] },
);

process.exit(result.exitCode ?? 0);
