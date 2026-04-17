import type { CommandContext } from "@stricli/core";

export interface LocalContext extends CommandContext {}

export function buildContext(): LocalContext {
  return {
    process,
  };
}

