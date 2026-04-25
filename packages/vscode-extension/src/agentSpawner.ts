import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

export interface ResolvedAgent {
  command: string;
  args: string[]; // includes the `--acp` final arg; caller may append further flags
  cwd: string;
  runtime: "node" | "bun" | "direct";
}

/**
 * Locate the CCB CLI binary and produce a spawn() command/args that launches
 * the agent in ACP mode (`claude --acp` per src/entrypoints/cli.tsx:135).
 *
 * Resolution order:
 *   1. Explicit `ccb.cliPath` setting (absolute path)
 *   2. Bun + monorepo source (preferred when developing on the fork)
 *   3. dist/cli.js or dist/cli-node.js in monorepo / workspace
 *   4. `ccb` or `claude` on PATH
 */
export function resolveAgent(extensionDir: string): ResolvedAgent | null {
  const config = vscode.workspace.getConfiguration("ccb");
  const setting = config.get<string>("cliPath", "auto");
  const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
  const node = findNode();
  const bun = findBun();

  if (setting && setting !== "auto") {
    if (!path.isAbsolute(setting)) {
      throw new Error(`ccb.cliPath must be an absolute path (got "${setting}")`);
    }
    if (!fs.existsSync(setting)) {
      throw new Error(`ccb.cliPath does not exist: ${setting}`);
    }
    // If setting points to source cli.tsx, run via Bun.
    if (setting.endsWith(".tsx") || setting.endsWith(".ts")) {
      if (!bun) {
        throw new Error(`ccb.cliPath points to TS source but Bun was not found.`);
      }
      return { command: bun, args: ["run", setting, "--acp"], cwd, runtime: "bun" };
    }
    if (isJavaScriptFile(setting)) {
      if (node) return { command: node, args: [setting, "--acp"], cwd, runtime: "node" };
      if (bun) return { command: bun, args: [setting, "--acp"], cwd, runtime: "bun" };
      throw new Error(`ccb.cliPath points to JS but neither Node.js nor Bun was found.`);
    }
    return { command: setting, args: ["--acp"], cwd, runtime: "direct" };
  }

  // auto-detect candidate roots
  const realDir = safeRealpath(extensionDir);
  const monorepoRoot = path.resolve(realDir, "..", "..");
  const candidateRoots = new Set<string>([safeRealpath(monorepoRoot), safeRealpath(cwd)]);

  for (const root of candidateRoots) {
    // 1) bundled dist (preferred — feature flags compiled in)
    const cliNodeJs = path.join(root, "dist", "cli-node.js");
    if (fs.existsSync(cliNodeJs) && node) {
      return { command: node, args: [cliNodeJs, "--acp"], cwd, runtime: "node" };
    }
    const cliJs = path.join(root, "dist", "cli.js");
    if (fs.existsSync(cliJs) && node) {
      return { command: node, args: [cliJs, "--acp"], cwd, runtime: "node" };
    }
    const cliBunJs = path.join(root, "dist", "cli-bun.js");
    if (fs.existsSync(cliBunJs) && bun) {
      return { command: bun, args: [cliBunJs, "--acp"], cwd, runtime: "bun" };
    }
    if (fs.existsSync(cliJs) && bun) {
      return { command: bun, args: [cliJs, "--acp"], cwd, runtime: "bun" };
    }
    // 2) source entry via Bun + scripts/dev.ts (this enables every feature flag,
    // including ACP). The plain `bun run cli.tsx` path does NOT enable feature
    // gates, so `--acp` would be rejected.
    const devScript = path.join(root, "scripts", "dev.ts");
    if (fs.existsSync(devScript) && bun) {
      return { command: bun, args: ["run", devScript, "--acp"], cwd, runtime: "bun" };
    }
    const cliTsx = path.join(root, "src", "entrypoints", "cli.tsx");
    if (fs.existsSync(cliTsx) && bun) {
      // Fallback: explicitly enable ACP feature flag.
      return { command: bun, args: ["run", "--feature", "ACP", cliTsx, "--acp"], cwd, runtime: "bun" };
    }
  }

  // 3) PATH lookup
  for (const candidate of ["ccb", "claude"]) {
    const found = findOnPath(candidate);
    if (found) return { command: found, args: ["--acp"], cwd, runtime: "direct" };
  }

  return null;
}

function isJavaScriptFile(p: string): boolean {
  return [".js", ".mjs", ".cjs"].includes(path.extname(p).toLowerCase());
}

function safeRealpath(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
}

function findBun(): string | null {
  const fromPath = findOnPath("bun");
  if (fromPath) return fromPath;

  const home = process.env.USERPROFILE ?? process.env.HOME ?? "";
  const candidates = process.platform === "win32"
    ? [path.join(home, ".bun", "bin", "bun.exe")]
    : [path.join(home, ".bun", "bin", "bun")];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function findNode(): string | null {
  const fromPath = findOnPath("node");
  if (fromPath) return fromPath;

  if (process.platform === "win32") {
    const candidates = [
      path.join(process.env.ProgramFiles ?? "C:\\Program Files", "nodejs", "node.exe"),
      path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "nodejs", "node.exe"),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  return null;
}

function findOnPath(executable: string): string | null {
  const locator = process.platform === "win32" ? "where.exe" : "which";
  try {
    const out = execFileSync(locator, [executable], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const first = out.split(/\r?\n/).find(Boolean);
    if (first && fs.existsSync(first)) return first;
  } catch {
    /* not on path */
  }
  return null;
}
