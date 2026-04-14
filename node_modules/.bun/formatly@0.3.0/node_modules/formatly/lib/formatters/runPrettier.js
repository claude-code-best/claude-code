import { createRequire } from "node:module";
import path from "node:path";
import { runFormatterCommand } from "./runFormatterCommand.js";
import { wrapSafe } from "./wrapSafe.js";
const runPrettier = async ({ cwd, patterns }) => {
  const require2 = createRequire(path.join(cwd, "index.js"));
  const prettierCli = wrapSafe(
    () => require2("prettier/internal/cli.mjs")
  );
  if (!prettierCli) {
    return await runFormatterCommand("npx prettier --write", { cwd, patterns });
  }
  await prettierCli.run(["--log-level", "silent", "--write", ...patterns]);
  return {
    runner: "virtual"
  };
};
export {
  runPrettier
};
