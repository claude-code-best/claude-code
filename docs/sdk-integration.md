---
title: Using ccb as @anthropic-ai/claude-agent-sdk backend
description: Switch the official Claude Agent SDK to spawn ccb as the Claude Code subprocess
---

# Using ccb as @anthropic-ai/claude-agent-sdk backend

ccb is a drop-in replacement for the Claude Code CLI when called from `@anthropic-ai/claude-agent-sdk`. Tested against SDK 0.2.141.

## Quick start

```ts
import { query } from '@anthropic-ai/claude-agent-sdk'

const messages = query({
  pathToClaudeCodeExecutable: require.resolve('claude-code-best/sdk'),
  prompt: 'Explain this codebase',
  model: 'claude-sonnet-4-6',
})

for await (const message of messages) {
  console.log(message)
}
```

## How it works

`@anthropic-ai/claude-agent-sdk` spawns a subprocess to run Claude Code. By setting `pathToClaudeCodeExecutable` to ccb's `dist/cli-node.js`, the SDK uses ccb for all Claude Code functionality — agent loop, tool calls, MCP, hooks, etc.

ccb is a faithful reimplementation of the Claude Code CLI, so all SDK options work as documented in the [official SDK reference](https://platform.claude.com/docs/en/agent-sdk/overview).

## Alternative paths

```ts
// Option A: subpath export (recommended)
pathToClaudeCodeExecutable: require.resolve('claude-code-best/sdk')

// Option B: main export
pathToClaudeCodeExecutable: require.resolve('claude-code-best')

// Option C: absolute file path
pathToClaudeCodeExecutable: '/usr/local/lib/node_modules/claude-code-best/dist/cli-node.js'

// Option D: binary on PATH (if installed globally)
pathToClaudeCodeExecutable: 'ccb'
```

## Supported options

ccb accepts the full SDK Options surface area. The complete alignment matrix — including which fields are wired, partially wired, or intentionally deferred — lives in [`docs/sdk-integration/gap-matrix.md`](./sdk-integration/gap-matrix.md).

Highlights of fields wired beyond the obvious:

- `systemPrompt` (preset form) — `excludeDynamicSections: true` strips per-user dynamic sections (git status, etc.) from the cached system prompt prefix and merges them into user-context user messages, enabling cross-user prompt caching
- `toolConfig.askUserQuestion.previewFormat` — controls what the model emits for `AskUserQuestion` option previews (`'markdown'` for CLI, `'html'` for web SDK consumers)
- `appendSubagentSystemPrompt` — text appended to every subagent's system prompt; useful for uniform policy/context injection
- `sandbox.network.deniedDomains` / `sandbox.network.allowMachLookup` — full SandboxSettings surface plumbed through to `@anthropic-ai/sandbox-runtime`
- `title` / `planModeInstructions` / `enableFileCheckpointing` — see Table B in the gap matrix
- `--managed-settings` CLI flag — inline JSON or file path, highest-priority policy source (above managed-settings.json / MDM / HKCU)

## Environment variables

The following SDK-defined environment variables are honored:

- `CLAUDE_CODE_DIAGNOSTICS_FILE` — write diagnostics to file
- `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` — disable telemetry
- `CLAUDE_CODE_USE_BEDROCK` / `CLAUDE_CODE_USE_VERTEX` / `CLAUDE_CODE_USE_FOUNDRY` / `CLAUDE_CODE_USE_OPENAI` / `CLAUDE_CODE_USE_GEMINI` / `CLAUDE_CODE_USE_GROK` — switch API provider
- `CLAUDE_CONFIG_DIR` — override config directory
- `CLAUDE_AGENT_SDK_CLIENT_APP` (set inside `env` option) — User-Agent identifier
- `CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING=1` — legacy env escape hatch for file checkpointing (SDK option `enableFileCheckpointing` is the documented path)

## Limitations

The following SDK options are `@alpha` and intentionally not wired:

- `sessionStore` / `sessionStoreFlush` / `loadTimeoutMs` — session store adapter surface; deferred

Forward-compat fields accepted but no-op (SDK 0.2.141 does not publish them; ccb accepts to prevent schema errors when a newer SDK forwards them):

- `forwardSubagentText` — subagent text forwarding already handled via `parent_tool_use_id` plumbing
- `webSearchIsolationExemptMcpServers` — web search isolation exemption list

See `docs/sdk-integration/gap-matrix.md` for the complete picture.

## Troubleshooting

### "unknown option" error

If you see `error: unknown option --<flag>`, your ccb version is older than the SDK version. Update ccb and check `docs/sdk-integration/gap-matrix.md` for the current alignment matrix.

### Process crashes on startup

Check stderr output. Common causes:

- Missing `--allow-dangerously-skip-permissions` when using `permissionMode: 'bypassPermissions'`
- Missing `--verbose` when using `outputFormat: 'stream-json'`
- Node.js trying to run `dist/cli-node.js` — use `bun run dist/cli-node.js` instead, since dist chunks may contain Bun-specific syntax (`using` declarations in tagged templates) that Node rejects. SDK consumers using `bun` as `executable` avoid this entirely

### stream-json output is malformed

ccb writes only JSONL to stdout. If something else writes to stdout, file a bug — `src/utils/streamJsonStdoutGuard.ts` should prevent this.

### Tests

End-to-end spawn tests live at `tests/integration/sdk-backend.test.ts` (T1 handshake, T2 flag compat, T3 canUseTool stub, T4 SIGTERM). Run with:

```bash
bun test tests/integration/sdk-backend.test.ts
```
