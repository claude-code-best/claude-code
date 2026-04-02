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

详细的测试规范、覆盖状态和改进计划见 `docs/testing-spec.md`。

## Architecture

### Runtime & Build

- **Runtime**: Bun (not Node.js). All imports, builds, and execution use Bun APIs.
- **Build**: `build.ts` 执行 `Bun.build()` with `splitting: true`，入口 `src/entrypoints/cli.tsx`，输出 `dist/cli.js` + ~450 chunk files。构建后自动替换 `import.meta.require` 为 Node.js 兼容版本（产物 bun/node 都可运行）。
- **Dev mode**: `scripts/dev.ts` 通过 Bun `-d` flag 注入 `MACRO.*` defines，运行 `src/entrypoints/cli.tsx`。`scripts/defines.ts` 集中管理 define map。
- **Module system**: ESM (`"type": "module"`), TSX with `react-jsx` transform.
- **Monorepo**: Bun workspaces — internal packages live in `packages/` resolved via `workspace:*`.
- **Lint/Format**: Biome (`biome.json`)。`bun run lint` / `bun run lint:fix` / `bun run format`。

### Entry & Bootstrap

1. **`src/entrypoints/cli.tsx`** — True entrypoint. Injects runtime polyfills at the top:
   - `feature()` always returns `false` (all feature flags disabled, skipping unimplemented branches).
   - `globalThis.MACRO` — simulates build-time macro injection (VERSION, BUILD_TIME, etc.).
   - `BUILD_TARGET`, `BUILD_ENV`, `INTERFACE_TYPE` globals.
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

All `feature('FLAG_NAME')` calls come from `bun:bundle` (a build-time API). In this decompiled version, `feature()` is polyfilled to always return `false` in `cli.tsx`. This means all Anthropic-internal features (COORDINATOR_MODE, KAIROS, PROACTIVE, etc.) are disabled.

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

- **框架**: `bun:test`（内置断言 + mock）
- **单元测试**: 就近放置于 `src/**/__tests__/`，文件名 `<module>.test.ts`
- **集成测试**: `tests/integration/`，共享 mock/fixture 在 `tests/mocks/`
- **命名**: `describe("functionName")` + `test("behavior description")`，英文
- **Mock 模式**: 对重依赖模块使用 `mock.module()` + `await import()` 解锁（必须内联在测试文件中，不能从共享 helper 导入）
- **当前状态**: 1286 tests / 67 files / 0 fail（详见 `docs/testing-spec.md` 的覆盖状态表和评分）

## Working with This Codebase

- **Don't try to fix all tsc errors** — they're from decompilation and don't affect runtime.
- **`feature()` is always `false`** — any code behind a feature flag is dead code in this build.
- **React Compiler output** — Components have decompiled memoization boilerplate (`const $ = _c(N)`). This is normal.
- **`bun:bundle` import** — In `src/main.tsx` and other files, `import { feature } from 'bun:bundle'` works at build time. At dev-time, the polyfill in `cli.tsx` provides it.
- **`src/` path alias** — tsconfig maps `src/*` to `./src/*`. Imports like `import { ... } from 'src/utils/...'` are valid.
- **MACRO defines** — 集中管理在 `scripts/defines.ts`。Dev mode 通过 `bun -d` 注入，build 通过 `Bun.build({ define })` 注入。修改版本号等常量只改这个文件。
- **构建产物兼容 Node.js** — `build.ts` 会自动后处理 `import.meta.require`，产物可直接用 `node dist/cli.js` 运行。
