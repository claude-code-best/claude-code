# ccb 作为 @anthropic-ai/claude-agent-sdk 后端 — 对齐与回归保护

- **日期**：2026-06-13
- **目标 SDK**：`@anthropic-ai/claude-agent-sdk@0.2.141`（已 vendored 类型在 `src/entrypoints/sdk/`）
- **范围级别**：L3 — CLI flag + Options 接通 + stream-json 协议对齐

## 1. 目标与非目标

### 目标

让任意第三方代码 `import { query } from '@anthropic-ai/claude-agent-sdk'` 后通过 `pathToClaudeCodeExecutable: require.resolve('claude-code-best/sdk')` 一行切换到 ccb 作为后端，且以下三层在 ccb 端的对齐度**可量化、可验证、可回归**：

1. SDK CLI flag（41 个）
2. SDK `Options` 字段内部接通（约 50 项）
3. stream-json 双向消息协议（`SDKMessage` 联合 + 子类型 + 生命周期事件）

### 非目标

- **不**恢复 stubbed 模块（Analytics / GrowthBook / Sentry 完整功能、MCP OAuth 高级流程）——属 L4
- **不**为 SDK 增加 ccb 特有的新 API（不污染 SDK 公共协议）
- **不**做 npm overrides / shim / postinstall 注入——保留"一行 `pathToClaudeCodeExecutable`"作为唯一对接方式
- **不**做官方二进制的动态 diff 测试（不依赖官方 Claude Code 二进制）
- **不**改 ACP 协议（`--acp`）—— 那是另一条通道（给 Zed/IDE 用），本次只管 SDK `--print` / stream-json 通道

## 2. 整体架构

```
第三方代码（用户项目）
    │
    │ 1. import { query } from '@anthropic-ai/claude-agent-sdk'
    │ 2. query({ pathToClaudeCodeExecutable: require.resolve('claude-code-best/sdk'),
    │           prompt: '...', mcpServers: {...}, ... })
    ▼
@anthropic-ai/claude-agent-sdk（npm 包，未改）
    │
    │ spawn: `node /path/to/ccb/dist/cli-node.js
    │         --print --output-format=stream-json --input-format=stream-json
    │         --model ... --permission-mode ... <其他 36 个 flag>`
    │ stdin:  SDKUserMessage JSONL
    │ stdout: 期望 SDKMessage JSONL 流
    ▼
ccb 进程（dist/cli-node.js → src/cli/print.ts）
    ├─ src/main.tsx                       Commander 解析 41 个 flag
    ├─ src/cli/print.ts                   print 模式生命周期编排
    ├─ src/cli/structuredIO.ts            stream-json stdin/stdout
    ├─ src/QueryEngine.ts                 对话循环
    ├─ src/services/api/claude.ts         Anthropic API（含 task_budget / effort / outputFormat）
    ├─ src/utils/messages/mappers.ts      内部消息 ↔ SDKMessage
    ├─ src/utils/streamlinedTransform.ts  stream-json 输出转换
    ├─ src/utils/streamJsonStdoutGuard.ts 保护 stdout 不被污染
    └─ src/entrypoints/sdk/               vendored SDK 类型（契约对照源）
```

**关键事实**：所有上述模块在 ccb 中已存在。本次工作是**审核 + 对齐 + 回归保护**，不是从零写。

## 3. 阶段 1 — 静态协议契约对齐（产出 gap matrix）

### 方法

把 SDK 视为三层契约，每层在 ccb 源码里逐项验证「真接通 / 部分接通 / 未接通 / 字段缺」。每条 gap 标注：

- **位置**（ccb 文件:行号）
- **状态**（✅ / ⚠️ / ❌）
- **影响**（哪些 SDK option 或场景会触发）
- **修补难度**（S / M / L）

### 三张子表

#### 表 A — CLI flag 对齐（41 项）

数据源：`node_modules/.bun/@anthropic-ai+claude-agent-sdk@*/sdk.mjs` 中所有 `"--<flag>"` 字面量。

预填初稿（基于 `src/main.tsx` Commander option 对比）：

- ✅ 已实现：37 项（含 `--add-dir`、`--agent`、`--allow-dangerously-skip-permissions`、`--assistant`、`--betas`、`--channels`、`--continue`、`--debug`、`--debug-file`、`--debug-to-stderr`、`--effort`、`--fallback-model`、`--fork-session`、`--hard-fail`、`--include-hook-events`、`--include-partial-messages`、`--input-format`、`--json-schema`、`--max-budget-usd`、`--max-thinking-tokens`、`--max-turns`、`--mcp-config`、`--model`、`--no-session-persistence`、`--output-format`、`--permission-mode`、`--permission-prompt-tool`、`--plugin-dir`、`--resume`、`--resume-session-at`、`--session-id`、`--strict-mcp-config`、`--task-budget`、`--thinking`、`--tools`、`--verbose`、`-c/--continue`、`-r/--resume`、`-p/--print`）
- ❌ 缺失：4 项（`--managed-settings`、`--porcelain`、`--session-mirror`、`--thinking-display`）

#### 表 B — SDK Options 字段接通（约 50 项）

数据源：`sdk.d.ts:1155-1807` 的 `Options` 联合类型字段。

每个字段不只看 CLI flag 是否存在，还要追内部数据流到底（API 调用、settings 加载、permission 流、生命周期事件发出）。

已知接通的字段：

- `taskBudget` → `src/services/api/claude.ts:463-486`（真发 `output_config.task_budget` + `task-budgets-2026-03-13` beta header）✅
- `effort` → `src/services/api/claude.ts:1666,1841`（合入 `output_config.effort`）✅
- `outputFormat` → `src/services/api/claude.ts:1662,1820`（合入 `output_config`）✅

待审计的字段（不限于）：

- `sandbox`（BashTool 有 `shouldUseSandbox.ts`，但 SDK 期望 bubblewrap 完整集成）
- `enableFileCheckpointing`
- `sessionStore` / `sessionStoreFlush` / `loadTimeoutMs`（标注 @alpha）
- `agentProgressSummaries`
- `forwardSubagentText`
- `promptSuggestions`（print 模式是否触发）
- `title`（print 模式）
- `onElicitation`（ccb 是否发出 elicitation 请求）
- `agents`（inline 定义是否接通）

#### 表 C — SDK 消息类型对齐

数据源：`src/entrypoints/sdk/coreTypes.ts`（vendored）的 `SDKMessage` 联合 + `SDKResultMessage` 子类型 + `SDKControlMessage`。契约源头是 `sdk.d.ts:5495` 的 `StdoutMessage`。

待审计的子类型（不限于）：

- `SDKResultMessage` 的 10+ 子类型（`success` / `error_max_turns` / `error_max_budget_usd` / `error_during_execution` 等）
- `SDKSystemMessage` 的 hook 子类型（`hook_started` / `hook_progress` / `hook_response`）
- `SDKPartialAssistantMessage`（`includePartialMessages`）
- `SDKPostTurnSummaryMessage`
- `SDKTaskSummaryMessage`
- `SDKTranscriptMirrorMessage`
- `SDKControlRequest` / `SDKControlResponse` / `SDKKeepAliveMessage`

### 产出物

1. **`docs/sdk-integration/gap-matrix.md`** — 三张表的完整版（审计报告）
2. **修补候选清单** — 表 B/C 中所有 ⚠️/❌ 项目，按 P0 / P1 / P2 分级：
   - **P0**：阻塞 SDK 常见用法（如 `query` 不返回 result、unknown option 报错）
   - **P1**：影响某个具体 option（如 `sandbox`、`enableFileCheckpointing`）
   - **P2**：alpha / 边缘场景（如 `sessionStore` 系列）

### 验收标准

- gap matrix 覆盖 SDK 0.2.141 全部 41 flag + 50+ Options 字段 + 全部 SDKMessage 子类型
- 每条 gap 必须有可定位的 ccb 文件:行号（即使"未实现"也要写明应该接到哪里）
- 修补候选清单必须按 P0 / P1 / P2 分级

## 4. 阶段 2 — 关键修补

### 判定闸门

阶段 1 gap matrix 中每条 ⚠️/❌ 都要走判定闸门：

```
gap 项
  │
  ├─ P0：阻塞 SDK 常见用法
  │     → 必修，本阶段完成
  │
  ├─ P1：影响某个具体 option
  │     → 评估"接通工作量"：
  │       工作量 ≤ L（≈1-2 文件、< 50 行）→ 本阶段做
  │       工作量 M/L                          → 列出来等用户决策
  │
  ├─ P2：alpha / 标注 @alpha 的字段
  │     → 不在本阶段做；写入 gap matrix "已知 gap" 段
  │
  └─ 仅交互模式有，print 模式天然不需要
        → 标"不适用"，不补
```

### 4 个缺失 CLI flag 的具体修补（表 A 全部 ❌ 项）

每条都是 P0，因为用户传对应 option 时 Commander 会直接报 `unknown option` 退出。

| Flag | 修补方案 | 接通点 |
|---|---|---|
| `--managed-settings <path\|json>` | 新增 Commander option + 在 settings 加载流程加入「policy tier」一层（优先级高于 user/project/local） | `src/utils/settings/settings.ts` |
| `--porcelain` | 新增 boolean Commander option + 在 print 模式下切换到机器友好稳定输出（不颜色化、不进度条、固定字段顺序 + ASCII 分隔符，参考 git porcelain 设计） | `src/cli/print.ts` 输出层 |
| `--session-mirror <path>` | 新增 Commander option + 在 transcript 写入 hook 中增加 dual-write 到指定文件 | `src/utils/conversationRecovery.ts` 或新增 mirror sink |
| `--thinking-display <mode>` | 新增 Commander option + 透传到 API 调用的 thinking 参数 | `src/services/api/claude.ts` thinking 参数构造 |

每条修补：

- 必须 1-3 个文件改动
- 必须有单元测试覆盖（解析 + 行为）
- 必须不破坏现有交互模式

### Options 接通修补（按 gap matrix 实际结果）

阶段 1 表 B 里 ⚠️ 项中，按判定闸门筛出来的 P0 / 轻量 P1。spec 不预填具体清单——审计本身就是工作。本阶段承诺：

1. P0 全部修
2. 工作量 ≤ L 的 P1 全部修
3. 工作量 M/L 的 P1 列出来在阶段 2 末尾给用户决策
4. P2 不修，文档化

### 消息类型补齐（按 gap matrix 实际结果）

阶段 1 表 C 里 ⚠️ 项中，**SDK 会主动期望收到的消息类型必修**；仅由 ccb 主动发送但 SDK 不期望的不动。判定契约：`sdk.d.ts:5495` 的 `StdoutMessage` 联合。

### 代码质量约束

- 修每个 gap 时**就地最小改动**——不顺手重构、不重命名、不抽公共函数
- 修补 commit 按 CLAUDE.md 的 Conventional Commits，type 用 `feat(sdk):` 或 `fix(sdk):`
- 每个修补 PR 必须 `bun run precheck` 零错误
- 修补结束后必须更新 `docs/sdk-integration/gap-matrix.md` 把对应条目从 ❌/⚠️ 改为 ✅

### 不在阶段 2 范围

- **不动** `src/services/api/claude.ts` 的 API 协议本身（不改 endpoint、不改认证流）
- **不动** ACP 协议（`src/services/acp/`）
- **不动** stubbed 模块（Analytics / GrowthBook / Sentry / MCP OAuth）
- **不优化**性能、**不调整** UI

## 5. 阶段 3 — SDK 集成 smoke test

### 目的

未来 SDK 升级或 ccb 改动 `src/cli/print.ts` / `src/utils/streamlinedTransform.ts` 等关键文件时，保证 ccb 仍能作为 SDK 后端工作。是 L3 的回归保护层。

### 测试架构

新增 `tests/integration/sdk-backend.test.ts`，跟现有 `tests/integration/` 下 6 个文件同风格：

```
1. 启动前：确保 dist/cli-node.js 存在（precheck 前置：先 bun run build）
2. child_process.spawn:
   node <repo>/dist/cli-node.js \
     --print \
     --output-format=stream-json \
     --input-format=stream-json \
     --model fake-key-no-real-api \
     --permission-mode bypassPermissions \
     --allow-dangerously-skip-permissions \
     --no-session-persistence
3. stdin 写入 SDKUserMessage JSONL
4. 收集 stdout JSONL，按 SDK 协议解析
5. 断言消息序列
6. kill 子进程
```

### 测试用例（最小集）

| 用例 | 验证 |
|---|---|
| **T1：握手 + 单轮** | 发 1 个 SDKUserMessage，期望收到 `assistant → result(success)` 序列 |
| **T2：flag 不报 unknown** | 41 个 SDK flag 全跑一遍 dry-run，无 unknown option 错 |
| **T3：canUseTool callback** | `canUseTool: async () => 'allow'`，发个会触发工具的 prompt，期望收到 tool_use / tool_result |
| **T4：abortController** | 中途 abort，期望收到 `error_during_execution` result 并进程退出 |
| **T5：stream-json 守护** | 子进程 stderr 中不应有 stdout 污染（验证 streamJsonStdoutGuard 工作） |
| **T6：resume / sessionId** | 用 `sessionId` 跑两次 query，第二次带上第一次返回的 session_id |

T1-T4 必做。T5 / T6 视审计阶段结果调整。

### 不在测试范围

- 不测真实 Anthropic API 调用（用 mock provider 或 dry-run 模式）
- 不测 OpenAI / Gemini / Grok 兼容层（独立测试覆盖）
- 不做长会话压测

## 6. 阶段 4 — package.json `exports` + 文档

### package.json 改动

```jsonc
{
  "name": "claude-code-best",
  "bin": { /* 不变 */ },
  "exports": {
    ".": {
      "types": "./dist/cli-node.d.ts",    // 如有；否则 omit
      "default": "./dist/cli-node.js"
    },
    "./sdk": {
      "types": "./dist/cli-node.d.ts",
      "default": "./dist/cli-node.js"
    },
    "./package.json": "./package.json"
  },
  "files": [
    "dist",
    "scripts/postinstall.cjs",
    "scripts/run-parallel.mjs",
    "scripts/setup-chrome-mcp.mjs"
  ]
}
```

要点：

- 不破坏 `bin` 字段（`ccb` / `ccb-bun` / `claude-code-best` 保持不变）
- `"./package.json"` 显式 export 是 pnpm / bun strict 模式兼容性需求
- `exports` 让 `require.resolve('claude-code-best/dist/cli-node.js')` 和 `require.resolve('claude-code-best/sdk')` 都可用

### 文档

新增 `docs/sdk-integration.md`（Mintlify 站点一节）：

1. **快速开始** — 3 行代码示例（`pathToClaudeCodeExecutable` 写法）
2. **支持的 Options** — 链接到 `gap-matrix.md`
3. **环境变量** — ccb 支持的环境变量（SDK 的 30 个）
4. **限制** — P2 不支持的 alpha 字段
5. **故障排查** — 常见问题（unknown option / 进程崩溃 / stream-json 异常）

`CLAUDE.md` 新增一段「SDK Integration」，指明 ccb 已是 SDK 后端，链接到 `docs/sdk-integration.md`。

## 7. 错误处理与回归保护

阶段 2 的修补如果触发失败，回滚原则：

- 修补一个 flag → 跑相关 unit test + sdk-backend smoke test → 通过则提交，失败则 revert
- 每个修补独立 commit，便于二分定位
- 出现"修补 X 导致 Y 回归"时，优先 revert X，不打补丁

## 8. 测试策略

| 测试层 | 范围 | 谁负责 |
|---|---|---|
| 单元测试 | 4 个新 CLI flag 的解析 + 每个 P0 修补的内部行为 | 跟着修补 PR |
| 集成测试（`sdk-backend.test.ts`） | 端到端 spawn + stream-json 握手 + 关键用例 | 阶段 3 |
| `bun run precheck` | 全项目 typecheck + lint + 全部单元/集成测试 | 每次 commit 必须通过 |

## 9. 交付物清单

阶段结束时拿到：

1. `docs/sdk-integration/gap-matrix.md` — 三张对齐表
2. `docs/sdk-integration.md` — Mintlify 用户文档
3. 4 个 CLI flag 的修补 + 单元测试
4. P0 / P1（≤ L）的修补（数量看审计结果）
5. `tests/integration/sdk-backend.test.ts` — 集成 smoke test
6. `package.json` 加 `exports` 字段
7. `CLAUDE.md` 新增「SDK Integration」段
8. 所有 commit 按 Conventional Commits

## 10. 规模预估

- 文档：约 600 行 markdown
- 代码：约 300-500 行 TS（含测试）
- 改动文件数：约 15 个

## 11. 实施顺序

1. 阶段 1：审计 + 产出 gap matrix（无代码改动）
2. 用户审核 gap matrix，决定 P1 中工作量 M/L 的项做哪些
3. 阶段 2：按 audit 结果修补（每个修补独立 commit）
4. 阶段 3：编写 sdk-backend.test.ts
5. 阶段 4：`exports` + 文档
6. `bun run precheck` 整体验证
7. 写 implementation plan 总结（交给 writing-plans skill）
