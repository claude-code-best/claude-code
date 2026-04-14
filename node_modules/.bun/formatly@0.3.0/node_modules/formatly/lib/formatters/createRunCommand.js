import { runFormatterCommand } from "./runFormatterCommand.js";
function createRunCommand(runner) {
  return async (options) => await runFormatterCommand(runner, options);
}
export {
  createRunCommand
};
