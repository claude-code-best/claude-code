import { findPackage } from "fd-package-json";
import * as fs from "node:fs/promises";
import { formatters } from "./formatters/all.js";
async function resolveFormatter(cwd = ".") {
  const children = await fs.readdir(cwd);
  for (const child of children) {
    for (const formatter of formatters) {
      if (formatter.testers.configFile.test(child)) {
        return formatter;
      }
    }
  }
  const packageData = await findPackage(cwd);
  if (!packageData) {
    return void 0;
  }
  const { scripts = {}, ...otherKeys } = packageData;
  for (const script of Object.values(scripts)) {
    for (const formatter of formatters) {
      if (formatter.testers.script.test(script)) {
        return formatter;
      }
    }
  }
  for (const formatter of formatters) {
    if ("packageKey" in formatter.testers && formatter.testers.packageKey in otherKeys) {
      return formatter;
    }
  }
  return void 0;
}
export {
  resolveFormatter
};
