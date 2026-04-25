import * as esbuild from "esbuild";

const isWatch = process.argv.includes("--watch");
const isProd = !isWatch || process.env.NODE_ENV === "production";

/** @type {esbuild.BuildOptions} */
const extensionConfig = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  platform: "node",
  format: "cjs",
  target: "node18",
  external: ["vscode"],
  sourcemap: !isProd,
  minify: isProd,
  logLevel: "info",
};

/** @type {esbuild.BuildOptions} */
const webviewConfig = {
  entryPoints: ["webview/index.tsx"],
  bundle: true,
  outfile: "dist/webview.js",
  platform: "browser",
  format: "iife",
  target: "es2020",
  sourcemap: !isProd,
  minify: isProd,
  logLevel: "info",
  loader: {
    ".css": "text",
  },
  define: {
    "process.env.NODE_ENV": isProd ? '"production"' : '"development"',
  },
};

async function main() {
  if (isWatch) {
    const extCtx = await esbuild.context(extensionConfig);
    const webCtx = await esbuild.context(webviewConfig);
    await Promise.all([extCtx.watch(), webCtx.watch()]);
    console.log("[esbuild] Watching for changes...");
  } else {
    await Promise.all([
      esbuild.build(extensionConfig),
      esbuild.build(webviewConfig),
    ]);
    console.log("[esbuild] Build complete.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
