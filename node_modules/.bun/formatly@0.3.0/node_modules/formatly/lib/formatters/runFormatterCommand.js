import { spawn } from "child_process";
async function runFormatterCommand(runner, { cwd, patterns }) {
  const [baseCommand, ...args] = runner.split(" ");
  return await new Promise((resolve, reject) => {
    const child = spawn(baseCommand, [...args, ...patterns], { cwd });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      resolve({
        code,
        runner: "child_process",
        signal
      });
    });
  });
}
export {
  runFormatterCommand
};
