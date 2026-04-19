#!/usr/bin/env node
import { run } from "@stricli/core";
import { app } from "./app.js";
import { buildContext } from "./context.js";

await run(app, process.argv.slice(2), buildContext());

