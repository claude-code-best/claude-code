# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and other AI coding agents when working with code in this repository.

## Project Overview

This is a **reverse-engineered / decompiled** version of Anthropic's official Claude Code CLI tool. The goal is to restore core functionality while trimming secondary capabilities. Many modules are stubbed or feature-flagged off. TypeScript strict mode is enforced — **`bunx tsc --noEmit` must pass with zero errors**.

## Git Commit Message Convention

使用 **Conventional Commits** 规范：

```
<type>: <描述>
```

常见 type：`feat`、`fix`、`docs`、`chore`、`refactor`

示例：
- `feat: 添加模型 1M 上下文切换`
- `fix: 修复初次登陆的校验问题`
- `chore: remove prefetchOfficialMcpUrls call on startup`

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

# Build (code splitting, outputs dist/cli.js + chunk files)
bun run build

# Build with Vite (alternative build pipeline)
bun run build:vite

# Test
bun test                                    # run all tests
bun test src/utils/__tests__/hash.test.ts   # run single file
bun test --coverage                         # with coverage report

# Lint & Format (Biome)
bun run lint              # check only
bun run lint:fix          # auto-fix
bun run format            # format all src/

# Health check
bun run health

# Check unused exports
bun run check:unused

# Full check (typecheck + lint + test) — run after completing any task
bun run test:all
bun run typecheck

# Remote Control Server
bun run rcs

# Docs dev server (Mintlify)
bun run docs:dev
```

详细的测试规范、覆盖状态和改进计划见 `docs/testing-spec.md`。

## Architecture

### Runtime & Build

- **Runtime**: Bun (not Node.js). All imports, builds, and execution use Bun APIs.
- **Build**: `build.ts` 执行 `Bun.build()` with `splitting: true`，入口 `src/entrypoints/cli.tsx`，输出 `dist/cli.js` + chunk files。Build 默认启用 19 个 feature（见下方 Feature Flag 段）。构建后自动替换 `import.meta.require` 为 Node.js 兼容版本（产物 bun/node 都可运行）。构建时会将 `vendor/audio-capture/` 和 `src/utils/vendor/ripgrep/` 复制到 `dist/vendor/` 下。
- **Build (Vite)**: `vite.config.ts` + `scripts/post-build.ts`，chunk 输出到 `dist/chunks/`。post-build 同样复制 vendor 文件到 `dist/vendor/`。
- **Vendor 路径解析**: 构建后 chunk 文件位于 `dist/` 或 `dist/chunks/` 下，vendor 二进制在 `dist/vendor/`。`src/utils/ripgrep.ts` 和 `packages/audio-capture-napi/src/index.ts` 均通过 `import.meta.url` 路径中 `lastIndexOf('dist')` 定位 dist 根目录，再拼接 `vendor/` 子路径，确保不同构建产物层级下路径一致。
- **Dev mode**: `scripts/dev.ts` 通过 Bun `-d` flag 注入 `MACRO.*` defines，运行 `src/entrypoints/cli.tsx`。默认启用全部 feature。
- **Module system**: ESM (`"type": "module"`), TSX with `react-jsx` transform.
- **Monorepo**: Bun workspaces — 15 个 workspace packages + 若干辅助目录 in `packages/` resolved via `workspace:*`。
- **Lint/Format**: Biome (`biome.json`)。`bun run lint` / `bun run lint:fix` / `bun run format`。
- **Defines**: 集中管理在 `scripts/defines.ts`。当前版本 `2.1.888`。
- **CI**: GitHub Actions — `ci.yml`（构建+测试）、`release-rcs.yml`（RCS 发布）、`update-contributors.yml`（自动更新贡献者）。

### Entry & Bootstrap

1. **`src/entrypoints/cli.tsx`** — True entrypoint。`main()` 函数按优先级处理多条快速路径：
   - `--version` / `-v` — 零模块加载
   - `--dump-system-prompt` — feature-gated (DUMP_SYSTEM_PROMPT)
   - `--claude-in-chrome-mcp` / `--chrome-native-host`
   - `--computer-use-mcp` — 独立 MCP server 模式
   - `--daemon-worker=<kind>` — feature-gated (DAEMON)
   - `remote-control` / `rc` / `remote` / `sync` / `bridge` — feature-gated (BRIDGE_MODE)
   - `daemon` [subcommand] — feature-gated (DAEMON)
   - `ps` / `logs` / `attach` / `kill` / `--bg` — feature-gated (BG_SESSIONS)
   - `new` / `list` / `reply` — Template job commands
   - `environment-runner` / `self-hosted-runner` — BYOC runner
   - `--tmux` + `--worktree` 组合
   - 默认路径：加载 `main.tsx` 启动完整 CLI
2. **`src/main.tsx`** (~6981 行) — Commander.js CLI definition。注册大量 subcommands：`mcp` (serve/add/remove/list...)、`server`、`ssh`、`open`、`auth`、`plugin`、`agents`、`auto-mode`、`doctor`、`update` 等。主 `.action()` 处理器负责权限、MCP、会话恢复、REPL/Headless 模式分发。
3. **`src/entrypoints/init.ts`** — One-time initialization (telemetry, config, trust dialog)。

### Core Loop

- **`src/query.ts`** — The main API query function. Sends messages to Claude API, handles streaming responses, processes tool calls, and manages the conversation turn loop.
- **`src/QueryEngine.ts`** — Higher-level orchestrator wrapping `query()`. Manages conversation state, compaction, file history snapshots, attribution, and turn-level bookkeeping. Used by the REPL screen.
- **`src/screens/REPL.tsx`** — The interactive REPL screen (React/Ink component). Handles user input, message display, tool permission prompts, and keyboard shortcuts.

### API Layer

- **`src/services/api/claude.ts`** — Core API client. Builds request params (system prompt, messages, tools, betas), calls the Anthropic SDK streaming endpoint, and processes `BetaRawMessageStreamEvent` events.
- **7 providers**: `firstParty` (Anthropic direct), `bedrock` (AWS), `vertex` (Google Cloud), `foundry`, `openai`, `gemini`, `grok` (xAI)。
- Provider selection in `src/utils/model/providers.ts`。优先级：modelType 参数 > 环境变量 > 默认 firstParty。

### Tool System

- **`src/Tool.ts`** — Tool interface definition (`Tool` type) and utilities (`findToolByName`, `toolMatchesName`).
- **`src/tools.ts`** — Tool registry. Assembles the tool list; tools are imported from `@claude-code-best/builtin-tools` package. Some tools are conditionally loaded via `feature()` flags or `process.env.USER_TYPE`.
- **`packages/builtin-tools/src/tools/`** — 59 个子目录（含 shared/testing 等工具目录），通过 `@claude-code-best/builtin-tools` 包导出。主要分类：
  - **文件操作**: FileEditTool, FileReadTool, FileWriteTool, GlobTool, GrepTool
  - **Shell/执行**: BashTool, PowerShellTool, REPLTool
  - **Agent 系统**: AgentTool, TaskCreateTool, TaskUpdateTool, TaskListTool, TaskGetTool
  - **规划**: EnterPlanModeTool, ExitPlanModeV2Tool, VerifyPlanExecutionTool
  - **Web/MCP**: WebFetchTool, WebSearchTool, MCPTool, McpAuthTool
  - **调度**: CronCreateTool, CronDeleteTool, CronListTool
  - **其他**: LSPTool, ConfigTool, SkillTool, EnterWorktreeTool, ExitWorktreeTool 等
- **`src/tools/shared/`** / **`packages/builtin-tools/src/tools/shared/`** — Tool 共享工具函数。

### UI Layer (Ink)

- **`src/ink.ts`** — Ink render wrapper with ThemeProvider injection.
- **`packages/@ant/ink/`** — Custom Ink framework（forked/internal），包含 components、core、hooks、keybindings、theme、utils。注意：不是 `src/ink/`。
- **`src/components/`** — 149 个组件目录/文件，渲染于终端 Ink 环境中。关键组件：
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

### Workspace Packages

| Package | 说明 |
|---------|------|
| `packages/@ant/ink/` | Forked Ink 框架（components、hooks、keybindings、theme） |
| `packages/@ant/computer-use-mcp/` | Computer Use MCP server（截图/键鼠/剪贴板/应用管理） |
| `packages/@ant/computer-use-input/` | 键鼠模拟（dispatcher + darwin/win32/linux backend） |
| `packages/@ant/computer-use-swift/` | 截图 + 应用管理（dispatcher + per-platform backend） |
| `packages/@ant/claude-for-chrome-mcp/` | Chrome 浏览器控制（通过 `--chrome` 启用） |
| `packages/@ant/model-provider/` | Model provider 抽象层 |
| `packages/builtin-tools/` | 内置工具集（60 个 tool 实现，通过 `@claude-code-best/builtin-tools` 导出） |
| `packages/agent-tools/` | Agent 工具集 |
| `packages/acp-link/` | ACP 代理服务器（WebSocket → ACP agent 桥接） |
| `packages/cc-knowledge/` | Claude Code 知识库（非 workspace 包） |
| `packages/langfuse-dashboard/` | Langfuse 可观测性面板（非 workspace 包） |
| `packages/mcp-client/` | MCP 客户端库 |
| `packages/mcp-server/` | MCP 服务端库（非 workspace 包） |
| `packages/remote-control-server/` | 自托管 Remote Control Server（Docker 部署，含 Web UI）— Web UI 已重构为 React + Vite + Radix UI，支持 ACP agent 接入 |
| `packages/swarm/` | Swarm 解耦模块（非 workspace 包） |
| `packages/shell/` | Shell 抽象（非 workspace 包） |
| `packages/audio-capture-napi/` | 原生音频捕获（已恢复） |
| `packages/color-diff-napi/` | 颜色差异计算（完整实现，11 tests） |
| `packages/image-processor-napi/` | 图像处理（已恢复） |
| `packages/modifiers-napi/` | 键盘修饰键检测（macOS FFI 实现） |
| `packages/url-handler-napi/` | URL scheme 处理（环境变量 + CLI 参数读取） |

### Bridge / Remote Control

- **`src/bridge/`** — Remote Control / Bridge 模式。feature-gated by `BRIDGE_MODE`。包含 bridge API、会话管理、JWT 认证、消息传输、权限回调等。Entry: `bridgeMain.ts`。
- **`packages/remote-control-server/`** — 自托管 RCS，支持 Docker 部署，含 Web UI 控制面板（React 19 + Vite + Radix UI）。支持 ACP agent 通过 acp-link 接入（ACP WebSocket handler、relay handler、SSE event stream）。通过 `bun run rcs` 启动。
- CLI 快速路径: `claude remote-control` / `claude rc` / `claude bridge`。
- 详见 `docs/features/remote-control-self-hosting.md`。

### ACP Protocol (Agent Client Protocol)

- **`src/services/acp/`** — ACP agent 实现，包含 `agent.ts`（AcpAgent 类）、`bridge.ts`（Claude Code ↔ ACP 桥接）、`permissions.ts`（权限处理）、`entry.ts`（入口）。
- **`packages/acp-link/`** — ACP 代理服务器，将 WebSocket 客户端桥接到 ACP agent。提供 `acp-link` CLI 命令，支持自定义端口/HTTPS/认证/会话管理、RCS 集成（REST 注册 + WS identify 两步流程）、权限模式透传（fallback: 客户端传值 > config > `ACP_PERMISSION_MODE` 环境变量）。
- ACP 权限管道改进：`createAcpCanUseTool` 统一权限流水线，`applySessionMode` 模式同步，`bypassPermissions` 可用性检测（非 root/sandbox 环境）。
- ACP Plan 可视化已支持 `session/update plan` 类型的消息展示（PlanView 组件，含进度条/状态图标/优先级标签）。

### Daemon Mode

- **`src/daemon/`** — Daemon 模式（长驻 supervisor）。feature-gated by `DAEMON`。包含 `main.ts`（entry）和 `workerRegistry.ts`（worker 管理）。

### Context & System Prompt

- **`src/context.ts`** — Builds system/user context for the API call (git status, date, CLAUDE.md contents, memory files).
- **`src/utils/claudemd.ts`** — Discovers and loads CLAUDE.md files from project hierarchy.

### Feature Flag System

Feature flags control which functionality is enabled at runtime. 代码中统一通过 `import { feature } from 'bun:bundle'` 导入，调用 `feature('FLAG_NAME')` 返回 `boolean`。

**启用方式**: 环境变量 `FEATURE_<FLAG_NAME>=1`。例如 `FEATURE_BUDDY=1 bun run dev`。

**Build 默认 features**（19 个，见 `build.ts`）:
- 基础: `BUDDY`, `TRANSCRIPT_CLASSIFIER`, `BRIDGE_MODE`, `AGENT_TRIGGERS_REMOTE`, `CHICAGO_MCP`, `VOICE_MODE`
- 统计/缓存: `SHOT_STATS`, `PROMPT_CACHE_BREAK_DETECTION`, `TOKEN_BUDGET`
- P0 本地: `AGENT_TRIGGERS`, `ULTRATHINK`, `BUILTIN_EXPLORE_PLAN_AGENTS`, `LODESTONE`
- P1 API 依赖: `EXTRACT_MEMORIES`, `VERIFICATION_AGENT`, `KAIROS_BRIEF`, `AWAY_SUMMARY`, `ULTRAPLAN`
- P2: `DAEMON`

**Dev mode 默认**: 全部启用（见 `scripts/dev.ts`）。

**类型声明**: `src/types/internal-modules.d.ts` 中声明了 `bun:bundle` 模块的 `feature` 函数签名。

**新增功能的正确做法**: 保留 `import { feature } from 'bun:bundle'` + `feature('FLAG_NAME')` 的标准模式，在运行时通过环境变量或配置控制，不要绕过 feature flag 直接 import。

### Multi-API 兼容层

所有兼容层均采用流适配器模式：将第三方 API 格式转为 Anthropic 内部格式，下游代码完全不改。通过 `/login` 命令配置。

#### OpenAI 兼容层

通过 `CLAUDE_CODE_USE_OPENAI=1` 启用，支持 Ollama/DeepSeek/vLLM 等任意 OpenAI Chat Completions 协议端点。含 DeepSeek thinking mode 支持。

- **`src/services/api/openai/`** — client、消息/工具转换、流适配、模型映射
- 关键环境变量：`CLAUDE_CODE_USE_OPENAI`、`OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL`

#### Gemini 兼容层

通过 `CLAUDE_CODE_USE_GEMINI=1` 启用。独立环境变量体系。

- **`src/services/api/gemini/`** — client、模型映射、类型定义
- 关键环境变量：`GEMINI_API_KEY`（必填）、`GEMINI_MODEL`（直接指定）、`GEMINI_DEFAULT_SONNET_MODEL`/`GEMINI_DEFAULT_OPUS_MODEL`（按能力映射）
- 模型映射优先级：`GEMINI_MODEL` > `GEMINI_DEFAULT_*_MODEL` > `ANTHROPIC_DEFAULT_*_MODEL`(已废弃) > 原样返回

#### Grok 兼容层

通过 `CLAUDE_CODE_USE_GROK=1` 启用。自定义模型映射支持 xAI Grok API。

- **`src/services/api/grok/`** — client、模型映射

详见各兼容层的 docs 文档。

### 穷鬼模式（Budget Mode）

- 通过 `/poor` 命令切换，持久化到 `settings.json`。
- 启用后跳过 `extract_memories`、`prompt_suggestion` 和 `verification_agent`，显著减少 token 消耗。
- 实现在 `src/commands/poor/poorMode.ts`。

### Stubbed/Deleted Modules

| Module | Status |
|--------|--------|
| Computer Use (`@ant/*`) | Restored — macOS + Windows + Linux（后端完整度不一） |
| `*-napi` packages | 全部已恢复/实现：`audio-capture-napi`、`image-processor-napi` 已恢复；`color-diff-napi` 完整；`modifiers-napi`（macOS FFI）；`url-handler-napi`（环境变量+CLI） |
| Voice Mode | Restored — Push-to-Talk 语音输入（需 Anthropic OAuth） |
| OpenAI/Gemini/Grok 兼容层 | Restored |
| Remote Control Server | Restored — 自托管 RCS + Web UI |
| Analytics / GrowthBook / Sentry | Empty implementations |
| Magic Docs / LSP Server | Restored — Magic Docs 自动更新 + LSP 服务器管理器 |
| Plugins / Marketplace | Restored — 插件安装/卸载/启用/禁用 + Marketplace 浏览 |
| MCP OAuth | Simplified |

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
- **包测试**: `packages/` 下各包也有独立测试（如 `color-diff-napi` 11 tests）

### Mock 使用规范

**只 mock 有副作用的依赖链，不 mock 纯函数/纯数据模块。**

被迫 mock 的根源：`log.ts` / `debug.ts` → `bootstrap/state.ts`（模块级 `realpathSync` / `randomUUID` 副作用）。必须 mock 的模块：`log.ts`、`debug.ts`、`bun:bundle`、`settings/settings.js`、`config.ts`、`auth.ts`、第三方网络库。

**`log.ts` 和 `debug.ts` 使用共享 mock**（`tests/mocks/log.ts` / `tests/mocks/debug.ts`），不要在测试文件中内联 mock 定义。使用方式：

```ts
import { logMock } from "../../../tests/mocks/log";
mock.module("src/utils/log.ts", logMock);

import { debugMock } from "../../../../tests/mocks/debug";
mock.module("src/utils/debug.ts", debugMock);
```

源文件导出变更时只需更新 `tests/mocks/` 下的对应文件，不需要逐个修改测试。

不要 mock：纯函数模块（`errors.ts`、`stringUtils.js`）、mock 值与真实实现相同的模块、mock 路径与实际 import 不匹配的模块。

路径规则：统一用 `.ts` 扩展名 + `src/*` 别名路径，禁止双重 mock 同一模块。

### 类型检查

项目使用 TypeScript strict 模式，**tsc 必须零错误**。每次修改后运行：

```bash
bun run typecheck
```

**类型规范**：
- 生产代码禁止 `as any`；测试文件中 mock 数据可用 `as any`
- 类型不匹配优先用 `as unknown as SpecificType` 双重断言，或补充 interface
- 未知结构对象用 `Record<string, unknown>` 替代 `any`
- 联合类型用类型守卫（type guard）收窄，不要强转
- `msg.request` 属性访问：`const req = msg.request as Record<string, unknown>`
- Ink `color` prop：用 `as keyof Theme` 而非 `as any`

## Working with This Codebase

- **tsc must pass** — `bun run typecheck` 必须零错误，任何修改都不能引入新的类型错误。
- **Feature flags** — 默认全部关闭（`feature()` 返回 `false`）。Dev/build 各有自己的默认启用列表。不要在 `cli.tsx` 中重定义 `feature` 函数。
- **React Compiler output** — Components have decompiled memoization boilerplate (`const $ = _c(N)`). This is normal.
- **`bun:bundle` import** — `import { feature } from 'bun:bundle'` 是 Bun 内置模块，由运行时/构建器解析。不要用自定义函数替代它。**`feature()` 只能直接用在 `if` 语句或三元表达式的条件位置**（Bun 编译器限制），不能赋值给变量、不能放在箭头函数体里、不能作为 `&&` 链的一部分。正确：`if (feature('X')) {}` 或 `feature('X') ? a : b`。
- **`src/` path alias** — tsconfig maps `src/*` to `./src/*`. Imports like `import { ... } from 'src/utils/...'` are valid.
- **MACRO defines** — 集中管理在 `scripts/defines.ts`。Dev mode 通过 `bun -d` 注入，build 通过 `Bun.build({ define })` 注入。修改版本号等常量只改这个文件。
- **构建产物兼容 Node.js** — `build.ts` 会自动后处理 `import.meta.require`，产物可直接用 `node dist/cli.js` 运行。
- **Biome 配置** — 大量 lint 规则被关闭（decompiled 代码不适合严格 lint）。`.tsx` 文件用 120 行宽 + 强制分号；其他文件 80 行宽 + 按需分号。
- **Ink 框架在 `packages/@ant/ink/`** — 不是 `src/ink/`（该目录不存在）。Ink 相关的组件、hooks、keybindings 都在 packages 中。
- **Provider 优先级** — `modelType` 参数 > 环境变量 > 默认 `firstParty`。新增 provider 需在 `src/utils/model/providers.ts` 注册。

## Design Context

Impeccable 设计上下文保存在 `.impeccable.md` 中。设计 Web UI（RCS 控制面板、文档站、着陆页）时必须参考该文件。

### 核心设计原则

1. **Considered over clever** — 每个设计选择都应感觉有意为之，而非追逐潮流
2. **Warmth through subtlety** — 通过橙色色调的中性色、留白布局、有温度的文案来传达温暖
3. **Density with clarity** — 技术用户需要信息密度，但不能混乱
4. **Community voice** — 设计应感觉是由使用者创造的，而非遥远的设计团队
5. **Anthropic's shadow** — 遵循 Anthropic 的设计直觉：干净的布局、充足的间距、温暖的色温

### 品牌色

- 主色：Claude Orange `#D77757`（terra cotta）
- 辅色：Claude Blue `#5769F7`
- 暗色模式使用温暖的深色表面（非冷蓝黑色）

### 目标用户

技术团队/企业，在专业工作流中使用 AI 辅助编程。友好的开源社区氛围，非企业 SaaS 风格。

### 视觉参考

Anthropic 公司的设计风格 — 干净、考究、温暖的底色。大量留白，以排版为核心。避免 AI 产品常见的设计套路（渐变文字、玻璃态、霓虹色）。
