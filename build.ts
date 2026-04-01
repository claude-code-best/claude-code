import { readdir, readFile, writeFile } from "fs/promises";
import { cpSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const outdir = "dist";

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Step 1: Clean output directory
const { rmSync, existsSync } = await import("fs");
rmSync(outdir, { recursive: true, force: true });

// Step 2: Bundle with splitting
const result = await Bun.build({
    entrypoints: ["src/entrypoints/cli.tsx"],
    outdir,
    target: "bun",
    splitting: true,
});

if (!result.success) {
    console.error("Build failed:");
    for (const log of result.logs) {
        console.error(log);
    }
    process.exit(1);
}

// Step 3: Copy ripgrep binary to dist/vendor/ripgrep
// Find ripgrep from claude-agent-sdk
const rgSourceDirs = [
    "node_modules/.bun/@anthropic-ai+claude-agent-sdk@0.2.87+3c5d820c62823f0b/node_modules/@anthropic-ai/claude-agent-sdk/vendor/ripgrep",
    "node_modules/@anthropic-ai/claude-agent-sdk/vendor/ripgrep",
];

let rgSourceDir = null;
for (const dir of rgSourceDirs) {
    const fullPath = join(__dirname, dir);
    if (existsSync(fullPath)) {
        rgSourceDir = fullPath;
        break;
    }
}

if (rgSourceDir) {
    const rgTargetDir = join(outdir, "vendor", "ripgrep");
    mkdirSync(rgTargetDir, { recursive: true });

    // Copy all platform binaries
    const platforms = ["x64-win32", "arm64-win32", "x64-darwin", "arm64-darwin", "x64-linux", "arm64-linux"];
    for (const platform of platforms) {
        const src = join(rgSourceDir, platform);
        const dst = join(rgTargetDir, platform);
        if (existsSync(src)) {
            mkdirSync(dst, { recursive: true });
            const binaryName = platform.includes("win32") ? "rg.exe" : "rg";
            const srcBinary = join(src, binaryName);
            const dstBinary = join(dst, binaryName);
            if (existsSync(srcBinary)) {
                cpSync(srcBinary, dstBinary);
                console.log(`Copied ripgrep binary: ${platform}/${binaryName}`);
            }
        }
    }
} else {
    console.warn("Warning: Could not find ripgrep binaries in node_modules");
}

// Step 4: Post-process — replace Bun-only `import.meta.require` with Node.js compatible version
const files = await readdir(outdir);
const IMPORT_META_REQUIRE = "var __require = import.meta.require;";
const COMPAT_REQUIRE = `var __require = typeof import.meta.require === "function" ? import.meta.require : (await import("module")).createRequire(import.meta.url);`;

let patched = 0;
for (const file of files) {
    if (!file.endsWith(".js")) continue;
    const filePath = join(outdir, file);
    const content = await readFile(filePath, "utf-8");
    if (content.includes(IMPORT_META_REQUIRE)) {
        await writeFile(
            filePath,
            content.replace(IMPORT_META_REQUIRE, COMPAT_REQUIRE),
        );
        patched++;
    }
}

console.log(
    `Bundled ${result.outputs.length} files to ${outdir}/ (patched ${patched} for Node.js compat)`,
);
