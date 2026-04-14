import { createRunCommand } from "./createRunCommand.js";
import { runPrettier } from "./runPrettier.js";
const formatters = [
  {
    name: "biome",
    runner: createRunCommand("npx @biomejs/biome format --write"),
    testers: {
      configFile: /biome\.json/,
      script: /biome\s+format/
    }
  },
  {
    name: "deno",
    runner: createRunCommand("deno fmt"),
    testers: {
      configFile: /deno\.json/,
      script: /deno/
    }
  },
  {
    name: "dprint",
    runner: createRunCommand("npx dprint fmt"),
    testers: {
      configFile: /dprint\.json/,
      script: /dprint/
    }
  },
  {
    name: "prettier",
    runner: runPrettier,
    testers: {
      configFile: /prettier(?:rc|\.)/,
      packageKey: "prettier",
      script: /prettier/
    }
  }
];
export {
  formatters
};
