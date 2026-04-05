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

# Dev mode with debugger (set BUN_INSPECT=9229 to pick port)
bun run dev:inspect

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

# Health check
bun run health

# Check unused exports
bun run check:unused

# Docs dev server (Mintlify)
bun run docs:dev
```

详细的测试规范、覆盖状态和改进计划见 `docs/testing-spec.md`。

## Architecture

### Runtime & Build

- **Runtime**: Bun (not Node.js). All imports, builds, and execution use Bun APIs.
- **Build**: `build.ts` 执行 `Bun.build()` with `splitting: true`，入口 `src/entrypoints/cli.tsx`，输出 `dist/cli.js` + chunk files。默认启用 `AGENT_TRIGGERS_REMOTE`、`CHICAGO_MCP`、`VOICE_MODE` feature。构建后自动替换 `import.meta.require` 为 Node.js 兼容版本（产物 bun/node 都可运行）。
- **Dev mode**: `scripts/dev.ts` 通过 Bun `-d` flag 注入 `MACRO.*` defines，运行 `src/entrypoints/cli.tsx`。默认启用 `BUDDY`、`TRANSCRIPT_CLASSIFIER`、`BRIDGE_MODE`、`AGENT_TRIGGERS_REMOTE`、`CHICAGO_MCP`、`VOICE_MODE` 六个 feature。
- **Module system**: ESM (`"type": "module"`), TSX with `react-jsx` transform.
- **Monorepo**: Bun workspaces — internal packages live in `packages/` resolved via `workspace:*`.
- **Lint/Format**: Biome (`biome.json`)。`bun run lint` / `bun run lint:fix` / `bun run format`。
- **Defines**: 集中管理在 `scripts/defines.ts`。当前版本 `2.1.888`。

### Entry & Bootstrap

1. **`src/entrypoints/cli.tsx`** — True entrypoint。`main()` 函数按优先级处理多条快速路径：
   - `--version` / `-v` — 零模块加载
   - `--dump-system-prompt` — feature-gated (DUMP_SYSTEM_PROMPT)
   - `--claude-in-chrome-mcp` / `--chrome-native-host`
   - `--daemon-worker=<kind>` — feature-gated (DAEMON)
   - `remote-control` / `rc` / `bridge` — feature-gated (BRIDGE_MODE)
   - `daemon` — feature-gated (DAEMON)
   - `ps` / `logs` / `attach` / `kill` / `--bg` — feature-gated (BG_SESSIONS)
   - `--tmux` + `--worktree` 组合
   - 默认路径：加载 `main.tsx` 启动完整 CLI
2. **`src/main.tsx`** (~4680 行) — Commander.js CLI definition。注册大量 subcommands：`mcp` (serve/add/remove/list...)、`server`、`ssh`、`open`、`auth`、`plugin`、`agents`、`auto-mode`、`doctor`、`update` 等。主 `.action()` 处理器负责权限、MCP、会话恢复、REPL/Headless 模式分发。
3. **`src/entrypoints/init.ts`** — One-time initialization (telemetry, config, trust dialog)。

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
- **`src/tools/<ToolName>/`** — 61 个 tool 目录（如 BashTool, FileEditTool, GrepTool, AgentTool, WebFetchTool, LSPTool, MCPTool 等）。每个 tool 包含 `name`、`description`、`inputSchema`、`call()` 及可选的 React 渲染组件。
- **`src/tools/shared/`** — Tool 共享工具函数。

### UI Layer (Ink)

- **`src/ink.ts`** — Ink render wrapper with ThemeProvider injection.
- **`src/ink/`** — Custom Ink framework (forked/internal): custom reconciler, hooks (`useInput`, `useTerminalSize`, `useSearchHighlight`), virtual list rendering.
- **`src/components/`** — 大量 React 组件（170+ 项），渲染于终端 Ink 环境中。关键组件：
  - `App.tsx` — Root provider (AppState, Stats, FpsMetrics)
  - `Messages.tsx` / `MessageRow.tsx` — Conversation message rendering
  - `PromptInput/` — User input handling
  - `permissions/` — Tool permission approval UI
  - `design-system/` — 复用 UI 组件（Dialog, FuzzyPicker, ProgressBar, ThemeProvider 等）
- Components use React Compiler runtime (`react/compiler-runtime`) — decompiled output has `_c()` memoization calls throughout.

### State Management

- **`src/state/AppState.tsx`** — Central app state type and context provider. Contains messages, tools, permissions, MCP connections, etc.
- **`src/state/AppStateStore.ts`** — Default state and store factory.
- **`src/state/store.ts`** — Zustand-style store for AppState (`createStore`).
- **`src/state/selectors.ts`** — State selectors.
- **`src/bootstrap/state.ts`** — Module-level singletons for session-global state (session ID, CWD, project root, token counts, model overrides, client type, permission mode).

### Bridge / Remote Control

- **`src/bridge/`** (~35 files) — Remote Control / Bridge 模式。feature-gated by `BRIDGE_MODE`。包含 bridge API、会话管理、JWT 认证、消息传输、权限回调等。Entry: `bridgeMain.ts`。
- CLI 快速路径: `claude remote-control` / `claude rc` / `claude bridge`。

### Daemon Mode

- **`src/daemon/`** — Daemon 模式（长驻 supervisor）。feature-gated by `DAEMON`。包含 `main.ts`（entry）和 `workerRegistry.ts`（worker 管理）。

### Context & System Prompt

- **`src/context.ts`** — Builds system/user context for the API call (git status, date, CLAUDE.md contents, memory files).
- **`src/utils/claudemd.ts`** — Discovers and loads CLAUDE.md files from project hierarchy.

### Feature Flag System

Feature flags control which functionality is enabled at runtime:

- **在代码中使用**: 统一通过 `import { feature } from 'bun:bundle'` 导入，调用 `feature('FLAG_NAME')` 返回 `boolean`。**不要**在 `cli.tsx` 或其他文件里自己定义 `feature` 函数或覆盖这个 import。
- **启用方式**: 通过环境变量 `FEATURE_<FLAG_NAME>=1`。例如 `FEATURE_BUDDY=1 bun run dev` 启用 BUDDY 功能。
- **Dev 默认 features**: `BUDDY`、`TRANSCRIPT_CLASSIFIER`、`BRIDGE_MODE`、`AGENT_TRIGGERS_REMOTE`、`CHICAGO_MCP`、`VOICE_MODE`（见 `scripts/dev.ts`）。
- **Build 默认 features**: `AGENT_TRIGGERS_REMOTE`、`CHICAGO_MCP`、`VOICE_MODE`（见 `build.ts`）。
- **常见 flag**: `BUDDY`, `DAEMON`, `BRIDGE_MODE`, `BG_SESSIONS`, `PROACTIVE`, `KAIROS`, `VOICE_MODE`, `FORK_SUBAGENT`, `SSH_REMOTE`, `DIRECT_CONNECT`, `TEMPLATES`, `CHICAGO_MCP`, `BYOC_ENVIRONMENT_RUNNER`, `SELF_HOSTED_RUNNER`, `COORDINATOR_MODE`, `UDS_INBOX`, `LODESTONE`, `ABLATION_BASELINE` 等。
- **类型声明**: `src/types/internal-modules.d.ts` 中声明了 `bun:bundle` 模块的 `feature` 函数签名。

**新增功能的正确做法**: 保留 `import { feature } from 'bun:bundle'` + `feature('FLAG_NAME')` 的标准模式，在运行时通过环境变量或配置控制，不要绕过 feature flag 直接 import。

### Stubbed/Deleted Modules

| Module | Status |
|--------|--------|
| Computer Use (`@ant/*`) | Restored — `computer-use-swift`, `computer-use-input`, `computer-use-mcp`, `claude-for-chrome-mcp` 均有完整实现，macOS + Windows 可用，Linux 后端待完成 |
| `*-napi` packages | `audio-capture-napi`、`image-processor-napi` 已恢复实现；`color-diff-napi` 完整实现；`url-handler-napi`、`modifiers-napi` 仍为 stub |
| Voice Mode | Restored — `src/voice/`、`src/hooks/useVoiceIntegration.tsx`、`src/services/voiceStreamSTT.ts` 等，Push-to-Talk 语音输入（需 Anthropic OAuth） |
| OpenAI 兼容层 | Restored — `src/services/api/openai/`，支持 Ollama/DeepSeek/vLLM 等任意 OpenAI 协议端点，通过 `CLAUDE_CODE_USE_OPENAI=1` 启用 |
| Analytics / GrowthBook / Sentry | Empty implementations |
| Magic Docs / LSP Server | Removed |
| Plugins / Marketplace | Removed |
| MCP OAuth | Simplified |

### Computer Use

Feature flag `CHICAGO_MCP`，dev/build 默认启用。实现跨平台屏幕操控（macOS + Windows 可用，Linux 待完成）。

- **`packages/@ant/computer-use-mcp/`** — MCP server，注册截图/键鼠/剪贴板/应用管理工具
- **`packages/@ant/computer-use-input/`** — 键鼠模拟，dispatcher + per-platform backend（`backends/darwin.ts`、`win32.ts`、`linux.ts`）
- **`packages/@ant/computer-use-swift/`** — 截图 + 应用管理，同样 dispatcher + per-platform backend
- **`packages/@ant/claude-for-chrome-mcp/`** — Chrome 浏览器控制（独立于 Computer Use，通过 `--chrome` CLI 参数启用）

详见 `docs/features/computer-use.md`。

### Voice Mode

Feature flag `VOICE_MODE`，dev/build 默认启用。Push-to-Talk 语音输入，音频通过 WebSocket 流式传输到 Anthropic STT（Nova 3）。需要 Anthropic OAuth（非 API key）。

- **`src/voice/voiceModeEnabled.ts`** — 三层门控（feature flag + GrowthBook + OAuth auth）
- **`src/hooks/useVoice.ts`** — React hook 管理录音状态和 WebSocket 连接
- **`src/services/voiceStreamSTT.ts`** — STT WebSocket 流式传输

详见 `docs/features/voice-mode.md`。

### OpenAI 兼容层

通过 `CLAUDE_CODE_USE_OPENAI=1` 环境变量启用，支持任意 OpenAI Chat Completions 协议端点（Ollama、DeepSeek、vLLM 等）。流适配器模式：在 `queryModel()` 中将 Anthropic 格式请求转为 OpenAI 格式，再将 SSE 流转换回 `BetaRawMessageStreamEvent`，下游代码完全不改。

- **`src/services/api/openai/`** — client、消息/工具转换、流适配、模型映射
- **`src/utils/model/providers.ts`** — 添加 `'openai'` provider 类型（最高优先级）

关键环境变量：`CLAUDE_CODE_USE_OPENAI`、`OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL`、`OPENAI_DEFAULT_OPUS_MODEL`、`OPENAI_DEFAULT_SONNET_MODEL`、`OPENAI_DEFAULT_HAIKU_MODEL`。详见 `docs/plans/openai-compatibility.md`。

### Key Type Files

- **`src/types/global.d.ts`** — Declares `MACRO`, `BUILD_TARGET`, `BUILD_ENV` and internal Anthropic-only identifiers.
- **`src/types/internal-modules.d.ts`** — Type declarations for `bun:bundle`, `bun:ffi`, `@anthropic-ai/mcpb`.
- **`src/types/message.ts`** — Message type hierarchy (UserMessage, AssistantMessage, SystemMessage, etc.).
- **`src/types/permissions.ts`** — Permission mode and result types.

## Testing

- **框架**: `bun:test`（内置断言 + mock）
- **单元测试**: 就近放置于 `src/**/__tests__/`，文件名 `<module>.test.ts`
- **集成测试**: `tests/integration/` — 4 个文件（cli-arguments, context-build, message-pipeline, tool-chain）
- **共享 mock/fixture**: `tests/mocks/`（api-responses, file-system, fixtures/）
- **命名**: `describe("functionName")` + `test("behavior description")`，英文
- **Mock 模式**: 对重依赖模块使用 `mock.module()` + `await import()` 解锁（必须内联在测试文件中，不能从共享 helper 导入）
- **当前状态**: ~1623 tests / 114 files (110 unit + 4 integration) / 0 fail（详见 `docs/testing-spec.md`）

## Working with This Codebase

- **Don't try to fix all tsc errors** — they're from decompilation and don't affect runtime.
- **Feature flags** — 默认全部关闭（`feature()` 返回 `false`）。Dev/build 各有自己的默认启用列表。不要在 `cli.tsx` 中重定义 `feature` 函数。
- **React Compiler output** — Components have decompiled memoization boilerplate (`const $ = _c(N)`). This is normal.
- **`bun:bundle` import** — `import { feature } from 'bun:bundle'` 是 Bun 内置模块，由运行时/构建器解析。不要用自定义函数替代它。
- **`src/` path alias** — tsconfig maps `src/*` to `./src/*`. Imports like `import { ... } from 'src/utils/...'` are valid.
- **MACRO defines** — 集中管理在 `scripts/defines.ts`。Dev mode 通过 `bun -d` 注入，build 通过 `Bun.build({ define })` 注入。修改版本号等常量只改这个文件。
- **构建产物兼容 Node.js** — `build.ts` 会自动后处理 `import.meta.require`，产物可直接用 `node dist/cli.js` 运行。
- **Biome 配置** — 大量 lint 规则被关闭（decompiled 代码不适合严格 lint）。`.tsx` 文件用 120 行宽 + 强制分号；其他文件 80 行宽 + 按需分号。
