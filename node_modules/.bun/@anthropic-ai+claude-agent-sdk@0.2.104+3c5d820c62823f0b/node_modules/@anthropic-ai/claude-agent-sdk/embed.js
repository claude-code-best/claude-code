/* eslint-disable custom-rules/no-top-level-side-effects */
// This file ships UNBUNDLED alongside sdk.mjs in the npm package.
// It is NOT pre-compiled — the user's bundler processes it directly.
//
// Usage for compiled Bun binaries (`bun build --compile`):
//
//   import cliPath from '@anthropic-ai/claude-agent-sdk/embed'
//   import { query } from '@anthropic-ai/claude-agent-sdk'
//
//   for await (const msg of query({
//     prompt: "hello",
//     options: { pathToClaudeCodeExecutable: cliPath },
//   })) {
//     console.log(msg)
//   }
//
// How it works:
// 1. The `import ... with { type: 'file' }` tells Bun's bundler to embed cli.js
//    into the compiled binary's $bunfs virtual filesystem
// 2. At runtime, extractFromBunfs() copies it to a temp directory so it can be
//    spawned as a subprocess (child processes cannot access the parent's $bunfs)

import embeddedCliPath from './cli.js' with { type: 'file' }
import { extractFromBunfs } from './extractFromBunfs.js'

export default extractFromBunfs(embeddedCliPath)
