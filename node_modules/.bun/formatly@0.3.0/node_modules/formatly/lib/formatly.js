import { formatters } from "./formatters/all.js";
import { resolveFormatter } from "./resolveFormatter.js";
async function formatly(patterns, options = {}) {
  if (!patterns.join("").trim()) {
    return {
      message: "No file patterns were provided to formatly.",
      ran: false
    };
  }
  const { cwd = process.cwd() } = options;
  const formatter = options.formatter ? formatters.find((f) => f.name === options.formatter) : await resolveFormatter(cwd);
  if (!formatter) {
    return { message: "Could not detect a reporter.", ran: false };
  }
  return {
    formatter,
    ran: true,
    result: await formatter.runner({ cwd, patterns })
  };
}
export {
  formatly
};
