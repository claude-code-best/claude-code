# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **reverse-engineered / decompiled** version of Anthropic's official Claude Code CLI tool. The goal is to restore core functionality while trimming secondary capabilities. Many modules are stubbed or feature-flagged off. The codebase has ~1341 tsc errors from decompilation (mostly `unknown`/`never`/`{}` types) — these do **not** block Bun runtime execution.

## Commands

```bash
# Install dependencies
bun install

# Dev mode (runs cli.tsx with MACRO defines injected via -d flags)
bun run dev

# Pipe mode
echo "say hello" | bun run src/entrypoints/cli.tsx -p

# Build (code splitting, outputs dist/cli.js + ~450 chunk files)
bun run build

# Test
bun test                  # run all tests
bun test src/utils/__tests__/hash.test.ts   # run single file
bun test --coverage       # with coverage report

# Lint & Format (Biome)
bun run lint              # check only
bun run lint:fix          # auto-fix
bun run format            # format all src/
```

For detailed testing specifications, coverage status, and improvement plans, see `docs/testing-spec.md`.

## Architecture

### Runtime & Build

- **Runtime**: Bun (not Node.js). All imports, builds, and execution use Bun APIs.
- **Build**: `build.ts` runs `Bun.build()` with `splitting: true`, entry point `src/entrypoints/cli.tsx`, outputs `dist/cli.js` + ~450 chunk files. After build, it automatically replaces `import.meta.require` with a Node.js-compatible version (build artifacts can run on both Bun and Node).
- **Dev mode**: `scripts/dev.ts` injects `MACRO.*` defines via Bun `-d` flags, running `src/entrypoints/cli.tsx`. `scripts/defines.ts` centrally manages the define map.
- **Module system**: ESM (`"type": "module"`), TSX with `react-jsx` transform.
- **Monorepo**: Bun workspaces — internal packages live in `packages/` resolved via `workspace:*`.
- **Lint/Format**: Biome (`biome.json`). `bun run lint` / `bun run lint:fix` / `bun run format`.

### Entry & Bootstrap

1. **`src/entrypoints/cli.tsx`** — True entrypoint. Sets up runtime globals:
   - `globalThis.MACRO` — build-time macro values (VERSION, BUILD_TIME, etc.), injected via `-d` flags from `scripts/dev.ts`.
   - `BUILD_TARGET`, `BUILD_ENV`, `INTERFACE_TYPE` globals.
   - `feature()` is provided by the `bun:bundle` built-in module and does not need to be polyfilled here.
2. **`src/main.tsx`** — Commander.js CLI definition. Parses args, initializes services (auth, analytics, policy), then launches the REPL or runs in pipe mode.
3. **`src/entrypoints/init.ts`** — One-time initialization (telemetry, config, trust dialog).

### Core Loop

- **`src/query.ts`** — The main API query function. Sends messages to Claude API, handles streaming responses, processes tool calls, and manages the conversation turn loop.
- **`src/QueryEngine.ts`** — Higher-level orchestrator wrapping `query()`. Manages conversation state, compaction, file history snapshots, attribution, and turn-level bookkeeping. Used by the REPL screen.
- **`src/screens/REPL.tsx`** — The interactive REPL screen (React/Ink component). Handles user input, message display, tool permission prompts, and keyboard shortcuts.

### API Layer

- **`src/services/api/claude.ts`** — Core API client. Builds request params (system prompt, messages, tools, betas), calls the Anthropic SDK streaming endpoint, and processes `BetaRawMessageStreamEvent` events.
- Supports multiple providers: Anthropic direct, AWS Bedrock, Google Vertex, Azure.
- Provider selection in `src/utils/model/providers.ts`.

### Tool System

- **`src/Tool.ts`** — Tool interface definition (`Tool` type) and utilities (`findToolByName`, `toolMatchesName`).
- **`src/tools.ts`** — Tool registry. Assembles the tool list; some tools are conditionally loaded via `feature()` flags or `process.env.USER_TYPE`.
- **`src/tools/<ToolName>/`** — Each tool in its own directory (e.g., `BashTool`, `FileEditTool`, `GrepTool`, `AgentTool`).
- Tools define: `name`, `description`, `inputSchema` (JSON Schema), `call()` (execution), and optionally a React component for rendering results.

### UI Layer (Ink)

- **`src/ink.ts`** — Ink render wrapper with ThemeProvider injection.
- **`src/ink/`** — Custom Ink framework (forked/internal): custom reconciler, hooks (`useInput`, `useTerminalSize`, `useSearchHighlight`), virtual list rendering.
- **`src/components/`** — React components rendered in terminal via Ink. Key ones:
  - `App.tsx` — Root provider (AppState, Stats, FpsMetrics).
  - `Messages.tsx` / `MessageRow.tsx` — Conversation message rendering.
  - `PromptInput/` — User input handling.
  - `permissions/` — Tool permission approval UI.
- Components use React Compiler runtime (`react/compiler-runtime`) — decompiled output has `_c()` memoization calls throughout.

### State Management

- **`src/state/AppState.tsx`** — Central app state type and context provider. Contains messages, tools, permissions, MCP connections, etc.
- **`src/state/store.ts`** — Zustand-style store for AppState.
- **`src/bootstrap/state.ts`** — Module-level singletons for session-global state (session ID, CWD, project root, token counts).

### Context & System Prompt

- **`src/context.ts`** — Builds system/user context for the API call (git status, date, CLAUDE.md contents, memory files).
- **`src/utils/claudemd.ts`** — Discovers and loads CLAUDE.md files from project hierarchy.

### Feature Flag System

Feature flags control which functionality is enabled at runtime. The system works as follows:

- **Usage in code**: Uniformly import via `import { feature } from 'bun:bundle'`, then call `feature('FLAG_NAME')` which returns a `boolean`. **Do not** define your own `feature` function or override this import in `cli.tsx` or other files.
- **Enabling flags**: Via environment variables `FEATURE_<FLAG_NAME>=1`. For example, `FEATURE_BUDDY=1 bun run dev` enables the BUDDY feature.
- **Dev mode**: `scripts/dev.ts` automatically scans all `FEATURE_*` environment variables and converts them to Bun `--feature` arguments passed to the runtime.
- **Build mode**: `build.ts` similarly reads `FEATURE_*` environment variables and passes them to the `Bun.build({ features })` array.
- **Default behavior**: When no `FEATURE_*` environment variables are set, all `feature()` calls return `false`, meaning all feature-gated code is disabled.
- **Common flag names**: `BUDDY`, `FORK_SUBAGENT`, `PROACTIVE`, `KAIROS`, `VOICE_MODE`, `DAEMON`, etc. (see usage in `src/commands.ts`).
- **Type declarations**: `src/types/internal-modules.d.ts` declares the `feature` function signature for the `bun:bundle` module.

**Best practice for adding new features**: To permanently enable a feature-gated module (e.g., buddy), keep the standard pattern of `import { feature } from 'bun:bundle'` + `feature('FLAG_NAME')` in the code, and control it at runtime via environment variables or configuration, rather than bypassing the feature flag with a direct import.

### Stubbed/Deleted Modules

| Module | Status |
|--------|--------|
| Computer Use (`@ant/*`) | Stub packages in `packages/@ant/` |
| `*-napi` packages (audio, image, url, modifiers) | Stubs in `packages/` (except `color-diff-napi` which is fully implemented) |
| Analytics / GrowthBook / Sentry | Empty implementations |
| Magic Docs / Voice Mode / LSP Server | Removed |
| Plugins / Marketplace | Removed |
| MCP OAuth | Simplified |

### Key Type Files

- **`src/types/global.d.ts`** — Declares `MACRO`, `BUILD_TARGET`, `BUILD_ENV` and internal Anthropic-only identifiers.
- **`src/types/internal-modules.d.ts`** — Type declarations for `bun:bundle`, `bun:ffi`, `@anthropic-ai/mcpb`.
- **`src/types/message.ts`** — Message type hierarchy (UserMessage, AssistantMessage, SystemMessage, etc.).
- **`src/types/permissions.ts`** — Permission mode and result types.

## Testing

- **Framework**: `bun:test` (built-in assertions + mocks)
- **Unit tests**: Co-located in `src/**/__tests__/`, file naming `<module>.test.ts`
- **Integration tests**: `tests/integration/`, shared mocks/fixtures in `tests/mocks/`
- **Naming**: `describe("functionName")` + `test("behavior description")`, in English
- **Mock pattern**: For modules with heavy dependencies, use `mock.module()` + `await import()` to unlock (must be inlined in the test file, cannot be imported from shared helpers)
- **Current status**: 1286 tests / 67 files / 0 failures (see the coverage status table and scoring in `docs/testing-spec.md`)

## Working with This Codebase

- **Don't try to fix all tsc errors** — they're from decompilation and don't affect runtime.
- **Feature flags** — All disabled by default (`feature()` returns `false`). See the Feature Flag System section above for how to enable them. Do not redefine the `feature` function in `cli.tsx`.
- **React Compiler output** — Components have decompiled memoization boilerplate (`const $ = _c(N)`). This is normal.
- **`bun:bundle` import** — `import { feature } from 'bun:bundle'` is a Bun built-in module, resolved by the runtime/bundler. Do not replace it with a custom function.
- **`src/` path alias** — tsconfig maps `src/*` to `./src/*`. Imports like `import { ... } from 'src/utils/...'` are valid.
- **MACRO defines** — Centrally managed in `scripts/defines.ts`. Dev mode injects via `bun -d`, build injects via `Bun.build({ define })`. To modify version numbers or other constants, only edit this file.
- **Build artifacts are Node.js-compatible** — `build.ts` automatically post-processes `import.meta.require`, so artifacts can be run directly with `node dist/cli.js`.
