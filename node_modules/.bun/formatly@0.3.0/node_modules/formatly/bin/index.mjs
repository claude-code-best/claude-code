#!/usr/bin/env node
import { cli } from "../lib/cli.js";

process.exitCode = await cli(process.argv.slice(2));
