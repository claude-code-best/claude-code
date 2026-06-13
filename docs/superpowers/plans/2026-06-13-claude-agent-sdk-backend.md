# ccb 作为 @anthropic-ai/claude-agent-sdk 后端 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 ccb 作为 `@anthropic-ai/claude-agent-sdk@0.2.141` 的后端时，CLI flag / Options 接通 / stream-json 协议三层对齐度可量化、可验证、可回归。

**Architecture:** 不从零写 SDK 后端——ccb 现有 `src/cli/print.ts`、`src/utils/messages/mappers.ts`、`src/entrypoints/sdk/` 已实现完整协议。本计划做四件事：(1) 静态审计产出 gap matrix；(2) 修补 4 个缺失 CLI flag + 审计发现的 P0/P1 gap；(3) 新增 SDK 集成 smoke test 作回归保护；(4) `package.json` 加 `exports` + 写文档。

**Tech Stack:** TypeScript（strict）、Bun（运行时/测试 `bun:test`）、Commander.js（`@commander-js/extra-typings`）、Biome（lint/format）。

**Spec:** `docs/superpowers/specs/2026-06-13-claude-agent-sdk-backend-design.md`

---

## 关键外部接口（已核实）

- SDK CLI flag 集合（41 项）从 `node_modules/.bun/@anthropic-ai+claude-agent-sdk@0.2.141*/sdk.mjs` 提取
- SDK `Options` 类型定义在 `node_modules/.bun/@anthropic-ai+claude-agent-sdk@0.2.141*/sdk.d.ts:1155-1807`
- SDK stdout 消息契约（`StdoutMessage` 联合）在 `sdk.d.ts:5495`
- ccb Commander option 注册：`src/main.tsx:1149-1430`
- ccb settings 加载（含 policySettings tier）：`src/utils/settings/settings.ts:243,323,661-675`
- ccb print 模式生命周期：`src/cli/print.ts`
- ccb stream-json 输出转换：`src/utils/streamlinedTransform.ts` + `src/utils/streamJsonStdoutGuard.ts`
- ccb 消息映射：`src/utils/messages/mappers.ts`
- ccb thinking config 类型：`src/utils/thinking.ts:11`（`ThinkingConfig`，无 `thinkingDisplay` 概念）
- ccb transcript 写入：`src/utils/sessionStorage.ts:1431`（`recordTranscript()`）
- ccb API 调用 thinking 参数构造：`src/services/api/claude.ts:735,742,754,1367`
- ccb task_budget 接通（参考用）：`src/services/api/claude.ts:463-486`

---

## 文件结构（创建/修改一览）

**审计产出（Phase 1）：**

| 文件 | 职责 |
|---|---|
| Create: `docs/sdk-integration/gap-matrix.md` | 三张对齐表 + 修补候选清单 |

**CLI flag 修补（Phase 2，每个独立 commit）：**

| 文件 | 职责 |
|---|---|
| Modify: `src/main.tsx`（Commander option 注册段，约 1389-1418） | 新增 4 个 option |
| Modify: `src/utils/settings/settings.ts` | 接通 `--managed-settings` 到 policySettings tier |
| Modify: `src/cli/print.ts` | 接通 `--porcelain` 到输出层 |
| Modify: `src/utils/sessionStorage.ts` | 接通 `--session-mirror` 到 `recordTranscript` |
| Modify: `src/utils/thinking.ts` + `src/services/api/claude.ts` | 接通 `--thinking-display` |
| Create: `src/cli/__tests__/sdk-flags.test.ts` | 4 个 flag 的 Commander 解析单元测试 |
| Create: `src/utils/settings/__tests__/managed-settings.test.ts` | managed-settings 加载单元测试 |
| Create: `src/utils/__tests__/session-mirror.test.ts` | session-mirror dual-write 单元测试 |

**SDK smoke test（Phase 4）：**

| 文件 | 职责 |
|---|---|
| Create: `tests/integration/sdk-backend.test.ts` | 端到端 spawn + stream-json 握手 + 用例 T1-T4 |

**exports + 文档（Phase 5）：**

| 文件 | 职责 |
|---|---|
| Modify: `package.json` | 加 `exports` 字段 |
| Create: `docs/sdk-integration.md` | Mintlify 用户文档 |
| Modify: `CLAUDE.md` | 新增「SDK Integration」段 |

**自然检查点：** Phase 1 完成后用户审核 gap matrix 决定 Phase 3 范围；Phase 2 每个 flag 是独立可发布 commit；Phase 4 完成后 ccb 具备回归保护；Phase 5 是收尾。

---

## Phase 1：静态协议契约对齐

### Task 1：创建 gap matrix 文档骨架

**Files:**
- Create: `docs/sdk-integration/gap-matrix.md`

- [ ] **Step 1：创建文档骨架**

写入以下内容到 `docs/sdk-integration/gap-matrix.md`：

```markdown
# ccb vs @anthropic-ai/claude-agent-sdk 协议对齐 Gap Matrix

- **SDK version**：0.2.141
- **生成日期**：2026-06-13
- **契约源头**：`node_modules/.bun/@anthropic-ai+claude-agent-sdk@0.2.141+68a1e3a0c4588df3/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`

## 表 A — CLI flag 对齐（41 项）

| Flag | ccb 实现 | 状态 | 备注 |
|---|---|---|---|

## 表 B — SDK Options 字段接通（约 50 项）

| Option 字段 | CLI 入口 | 内部接通点 | 状态 | 备注 |
|---|---|---|---|---|

## 表 C — SDK 消息类型对齐

| 消息类型 | ccb 发送点 | 状态 | 备注 |
|---|---|---|---|

## 修补候选清单

### P0（阻塞 SDK 常见用法，必修）

- [ ] ...

### P1（影响具体 option，工作量 ≤ L 时修）

- [ ] ...

### P1-M/L（工作量较大，待用户决策）

- [ ] ...

### P2（alpha / 边缘，本阶段不修）

- [ ] ...
```

- [ ] **Step 2：commit**

```bash
git add docs/sdk-integration/gap-matrix.md
git commit -m "docs(sdk): scaffold gap matrix for claude-agent-sdk alignment"
```

---

### Task 2：完成表 A — CLI flag 对齐

**Files:**
- Modify: `docs/sdk-integration/gap-matrix.md`

- [ ] **Step 1：提取 SDK 实际传给子进程的全部 flag**

Run:
```bash
tr ';' '\n' < node_modules/.bun/@anthropic-ai+claude-agent-sdk@0.2.141+*/node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs | grep -oE '"--[a-z-]+"' | sort -u
```
Expected: 输出约 41 行 `--<flag>` 列表。

- [ ] **Step 2：在 ccb 源码中验证每个 flag 的实现位置**

对每个 flag，用以下命令找到 ccb 中的 Commander option 注册点：

```bash
grep -nE "('<flag-name-without-equals>'|--<flag-name>)" src/main.tsx
```

记录每条的文件:行号。无法找到的归入 ❌。

- [ ] **Step 3：填充表 A**

把表 A 替换为完整表格。已知结果（spec 已预填）：

- 37 ✅：`--add-dir` `--agent` `--allow-dangerously-skip-permissions` `--assistant` `--betas` `--channels` `--continue`（含 `-c`）`--debug` `--debug-file` `--debug-to-stderr` `--effort` `--fallback-model` `--fork-session` `--hard-fail` `--include-hook-events` `--include-partial-messages` `--input-format` `--json-schema` `--max-budget-usd` `--max-thinking-tokens` `--max-turns` `--mcp-config` `--model` `--no-session-persistence` `--output-format` `--permission-mode` `--permission-prompt-tool` `--plugin-dir` `--resume`（含 `-r`）`--resume-session-at` `--session-id` `--strict-mcp-config` `--task-budget` `--thinking` `--tools` `--verbose` `-p/--print`
- 4 ❌：`--managed-settings` `--porcelain` `--session-mirror` `--thinking-display`

每行格式：

```markdown
| `--add-dir` | `src/main.tsx:1393` | ✅ | — |
| `--managed-settings` | — | ❌ | 待 Phase 2 Task 6 修补 |
```

- [ ] **Step 4：commit**

```bash
git add docs/sdk-integration/gap-matrix.md
git commit -m "docs(sdk): complete table A — CLI flag alignment (37 ✅, 4 ❌)"
```

---

### Task 3：完成表 B — SDK Options 字段接通审计

**Files:**
- Modify: `docs/sdk-integration/gap-matrix.md`

- [ ] **Step 1：枚举 SDK Options 全部字段**

从 `sdk.d.ts:1155-1807` 的 `Options` 联合类型枚举每个字段。完整字段列表（按字母排序）：

`abortController` `additionalDirectories` `agent` `agents` `allowedTools` `allowDangerouslySkipPermissions` `canUseTool` `continue` `cwd` `disallowedTools` `tools` `env` `executable` `executableArgs` `extraArgs` `fallbackModel` `enableFileCheckpointing` `toolConfig` `forkSession` `betas` `hooks` `onElicitation` `persistSession` `sessionStore` `sessionStoreFlush` `loadTimeoutMs` `includeHookEvents` `includePartialMessages` `forwardSubagentText` `thinking` `effort` `maxThinkingTokens` `maxTurns` `maxBudgetUsd` `taskBudget` `mcpServers` `model` `outputFormat` `pathToClaudeCodeExecutable` `permissionMode` `planModeInstructions` `permissionPromptToolName` `plugins` `promptSuggestions` `agentProgressSummaries` `resume` `sessionId` `resumeSessionAt` `sandbox` `settings` `managedSettings` `settingSources` `skills` `debug` `debugFile` `stderr` `strictMcpConfig` `systemPrompt` `title` `spawnClaudeCodeProcess`

- [ ] **Step 2：逐字段在 ccb 中验证接通**

对每个字段，按下面分类查证。每个字段至少跑一次 `grep`，记录结果。

**分类 A：进程控制类（不需要 ccb 端实现）**
- `abortController` / `cwd` / `env` / `executable` / `executableArgs` / `pathToClaudeCodeExecutable` / `spawnClaudeCodeProcess`：SDK 端处理，ccb 不需要实现。状态标 `N/A — SDK-side`。

**分类 B：仅传递给子进程的环境变量类（不需要 ccb 端专门处理）**
- `stderr` / `debug` / `debugFile`：SDK 端捕获或透传。ccb 端只要正确写 stderr 即可。状态查 `src/utils/log.ts` 和 `src/utils/debug.ts` 是否完整。预期 ✅。

**分类 C：已确认接通（spec 阶段已验证）**
- `taskBudget` → `src/services/api/claude.ts:463-486` ✅
- `effort` → `src/services/api/claude.ts:1666,1841` ✅
- `outputFormat` → `src/services/api/claude.ts:1662,1820` ✅

**分类 D：需逐项查证（核心审计工作）**

对下列每个字段，用 grep 在 ccb 源码中找：

```bash
grep -nR "<字段名或相关关键字>" src/ packages/builtin-tools/src/ --include='*.ts' --include='*.tsx' -l
```

需要查证的字段清单：

- `additionalDirectories` → 查 `--add-dir` 后内部如何使用（`allowedDirectories` / `additionalDirectories`）
- `agent` → 查 `--agent` 接通点
- `agents` → 查 inline agents 定义如何接通（`src/utils/forkedAgent.ts`、`@claude-code-best/builtin-tools/tools/AgentTool/loadAgentsDir.ts`）
- `allowedTools` / `disallowedTools` / `tools` → 查 `src/tools.ts` 工具池组装
- `allowDangerouslySkipPermissions` → 查 `src/utils/permissions/`
- `canUseTool` → 查 permission callback 流
- `continue` / `resume` / `sessionId` / `resumeSessionAt` / `forkSession` → 查 `src/utils/conversationRecovery.ts`
- `persistSession` → 查 `src/utils/queryHelpers.ts:253`
- `betas` → 查 `src/services/api/claude.ts` betas header
- `hooks` / `includeHookEvents` → 查 `src/utils/hooks/`
- `onElicitation` → 查 elicitation 请求发出点（grep `elicitation`）
- `sessionStore` / `sessionStoreFlush` / `loadTimeoutMs` → 查 alpha session store 实现
- `includePartialMessages` → 查 `src/utils/streamlinedTransform.ts`
- `forwardSubagentText` → 查 subagent 消息转发
- `thinking` / `maxThinkingTokens` → 查 `src/utils/thinking.ts`
- `maxTurns` / `maxBudgetUsd` → 查 `src/QueryEngine.ts`
- `mcpServers` / `strictMcpConfig` → 查 `src/services/mcp/`
- `model` / `fallbackModel` → 查 `src/utils/model/`
- `permissionMode` / `permissionPromptToolName` → 查 `src/utils/permissions/`
- `planModeInstructions` → 查 plan mode 实现
- `plugins` → 查 `src/utils/plugins/`
- `promptSuggestions` → 查 `src/services/PromptSuggestion/`
- `agentProgressSummaries` → 查 subagent progress summary
- `sandbox` → 查 `src/utils/sandbox/`、`packages/builtin-tools/src/tools/BashTool/shouldUseSandbox.ts`
- `settings` / `managedSettings` / `settingSources` → 查 `src/utils/settings/settings.ts`
- `skills` → 查 `src/skills/`
- `strictMcpConfig` → 查 `src/services/mcp/`
- `systemPrompt` → 查 `src/constants/prompts.ts`、`src/context.ts`
- `title` → 查 session title 设置（grep `session.*title` / `renameSession`）
- `enableFileCheckpointing` → 查 file checkpoint 实现（grep `checkpoint` / `rewind`）

- [ ] **Step 3：填充表 B**

每个字段一行，格式：

```markdown
| `taskBudget` | `--task-budget` | `src/services/api/claude.ts:463-486` | ✅ | 真发 output_config.task_budget + beta header |
| `sandbox` | （无 CLI flag，SDK 直传） | `packages/builtin-tools/src/tools/BashTool/shouldUseSandbox.ts` | ⚠️ | bash 命令走 sandbox，但需验证 bubblewrap 完整调用 |
| `enableFileCheckpointing` | — | — | ❌ | 待评估是否在范围内 |
| `sessionStore` | — | — | ❌ | @alpha，本阶段不修（P2） |
```

- [ ] **Step 4：commit**

```bash
git add docs/sdk-integration/gap-matrix.md
git commit -m "docs(sdk): complete table B — Options field wiring audit"
```

---

### Task 4：完成表 C — SDK 消息类型对齐审计

**Files:**
- Modify: `docs/sdk-integration/gap-matrix.md`

- [ ] **Step 1：枚举 SDK stdout 消息类型**

从 `sdk.d.ts:5495` 的 `StdoutMessage` 联合提取：

```
SDKMessage | SDKPostTurnSummaryMessage | SDKTaskSummaryMessage | SDKTranscriptMirrorMessage | SDKControlResponse | SDKControlRequest | SDKControlCancelRequest | SDKKeepAliveMessage
```

`SDKMessage` 自身又是联合，从 `src/entrypoints/sdk/coreTypes.ts` 提取子类型。

- [ ] **Step 2：对每个消息类型在 ccb 中查发送点**

```bash
grep -nR "<消息类型>" src/ --include='*.ts' --include='*.tsx'
```

重点查证：

- `SDKAssistantMessage` → `src/utils/messages/mappers.ts`、`src/utils/queryHelpers.ts:356`
- `SDKUserMessage`（replay） → `src/cli/print.ts` replay 逻辑
- `SDKResultMessage` 子类型 → `src/cli/print.ts` + `src/services/api/errors.ts`
  - `success` / `error_max_turns` / `error_max_budget_usd` / `error_during_execution` 等
- `SDKSystemMessage` 子类型 → `src/utils/hooks/hookEvents.ts`
  - `hook_started` / `hook_progress` / `hook_response`
- `SDKPartialAssistantMessage` → `src/utils/streamlinedTransform.ts`
- `SDKPostTurnSummaryMessage` → grep `post_turn_summary`
- `SDKTaskSummaryMessage` → grep `task_summary`
- `SDKTranscriptMirrorMessage` → grep `transcript_mirror`
- `SDKControlRequest` / `SDKControlResponse` / `SDKControlCancelRequest` → `src/entrypoints/sdk/controlSchemas.ts` + 接通点
- `SDKKeepAliveMessage` → grep `keep_alive` / `keepalive`

- [ ] **Step 3：填充表 C**

格式：

```markdown
| `SDKAssistantMessage` | `src/utils/queryHelpers.ts:356` | ✅ | — |
| `SDKResultMessage.success` | `src/cli/print.ts` | ✅ | — |
| `SDKResultMessage.error_max_budget_usd` | （查证后填） | ⚠️ | 需验证预算耗尽时是否真发该 subtype |
| `SDKKeepAliveMessage` | （查证后填） | ❌ | 待确认是否需要 |
```

- [ ] **Step 4：commit**

```bash
git add docs/sdk-integration/gap-matrix.md
git commit -m "docs(sdk): complete table C — message type alignment audit"
```

---

### Task 5：整理修补候选清单

**Files:**
- Modify: `docs/sdk-integration/gap-matrix.md`

- [ ] **Step 1：把表 A/B/C 中所有 ❌ 和 ⚠️ 项摘到「修补候选清单」段**

按 spec 第 4 节判定闸门分级：

- **P0**：阻塞 SDK 常见用法（如 unknown option、query 不返回 result）
- **P1**：影响某个具体 option，工作量 ≤ L（1-2 文件、< 50 行）
- **P1-M/L**：影响具体 option 但工作量大，待用户决策
- **P2**：alpha 字段或边缘场景，本阶段不修

已知分级（预填）：

- P0：4 个缺失 CLI flag（`--managed-settings` / `--porcelain` / `--session-mirror` / `--thinking-display`）
- P2：`sessionStore` / `sessionStoreFlush` / `loadTimeoutMs`（@alpha）

其余项按 Step 1 grep 结果分级。

- [ ] **Step 2：commit**

```bash
git add docs/sdk-integration/gap-matrix.md
git commit -m "docs(sdk): finalize repair candidate list with P0/P1/P2 classification"
```

- [ ] **Step 3：暂停，请用户审核 gap matrix**

输出消息：

```
Phase 1 完成。gap matrix 已落盘 docs/sdk-integration/gap-matrix.md。

请审核以下决策点：
1. P1-M/L 项目要做哪些？
2. P2 项目确认本阶段不做？

审核通过后进入 Phase 2 实施。
```

**等用户回复后再继续 Phase 2。**

---

## Phase 2：4 个缺失 CLI flag 修补

> **执行约定：** 每个 Task 严格 TDD（先写失败测试 → 验证失败 → 实现 → 验证通过 → commit）。每个 commit 是独立可二分定位的。修补前先用 Read 读现有代码，理解接通点的上下文。

### Task 6：修补 `--managed-settings` flag

**Files:**
- Modify: `src/main.tsx`（Commander option 注册段，约 1389 行附近 `--settings` 之后）
- Modify: `src/utils/settings/settings.ts`
- Test: `src/utils/settings/__tests__/managed-settings.test.ts`

**接通方案：** 新增 Commander option，在 `loadSettingsFromDisk()` 中加入「policy tier」一层（优先级高于 user/project/local/flag）。ccb 已有 `policySettings` 概念（`settings.ts:243,323`），但当前是从 HKLM/plist/remote 拉，需要补充从 CLI flag 加载。

- [ ] **Step 1：读现有 settings 加载流程**

```bash
grep -nE "policySettings|flagSettings|managedSettings|loadSettingsFromDisk" src/utils/settings/settings.ts | head -30
```

记录 `loadSettingsFromDisk()` 在哪一行合并各 tier（spec 提示是 `settings.ts:661-675`）。

- [ ] **Step 2：写失败测试**

Create `src/utils/settings/__tests__/managed-settings.test.ts`：

```typescript
import { describe, expect, test } from 'bun:test'
import { Command } from '@commander-js/extra-typings'

// 验证 --managed-settings flag 的 Commander 解析 + 加载逻辑契约
// 完整集成测试见 tests/integration/sdk-backend.test.ts

function createTestProgram(): Command {
  const program = new Command()
  program
    .name('claude-code')
    .exitOverride()
    .configureOutput({ writeErr: () => {}, writeOut: () => {} })
    .option('--managed-settings <path|json>', 'Policy-tier settings (highest priority)')
  return program
}

describe('--managed-settings flag', () => {
  test('accepts file path', () => {
    const program = createTestProgram()
    program.parse(['node', 'test', '--managed-settings', '/etc/claude/policy.json'])
    expect(program.opts().managedSettings).toBe('/etc/claude/policy.json')
  })

  test('accepts inline JSON', () => {
    const program = createTestProgram()
    program.parse(['node', 'test', '--managed-settings', '{"sandbox":{"enabled":true}}'])
    expect(program.opts().managedSettings).toBe('{"sandbox":{"enabled":true}}')
  })

  test('not required', () => {
    const program = createTestProgram()
    program.parse(['node', 'test'])
    expect(program.opts().managedSettings).toBeUndefined()
  })
})
```

- [ ] **Step 3：跑测试看失败**

Run: `bun test src/utils/settings/__tests__/managed-settings.test.ts`
Expected: FAIL — Commander option 不存在导致解析错误，或 opts 为 undefined。

- [ ] **Step 4：在 src/main.tsx 加 Commander option**

在 `--settings` 选项（约 1389-1392 行）之后插入：

```typescript
    .option(
      '--managed-settings <file-or-json>',
      'Policy-tier settings file path or JSON string (highest priority, overrides user/project/local)',
    )
```

- [ ] **Step 5：跑测试看通过**

Run: `bun test src/utils/settings/__tests__/managed-settings.test.ts`
Expected: PASS。

- [ ] **Step 6：在 settings.ts 加载流程接通**

Read `src/utils/settings/settings.ts:645-700`（`loadSettingsFromDisk` 函数体），找到 `policySettings` 分支（约 661-675 行）。

在合并 `policySettings` 之前，添加从 CLI flag 加载的逻辑。参考实现（执行时根据实际代码调整）：

```typescript
// 在 loadSettingsFromDisk 中，policySettings 合并分支之前
const cliManagedSettings = process.env.CLI_MANAGED_SETTINGS // 或从 commander.opts 传递
if (cliManagedSettings) {
  const parsed = typeof cliManagedSettings === 'string' && cliManagedSettings.startsWith('{')
    ? JSON.parse(cliManagedSettings)
    : JSON.parse(await readFile(cliManagedSettings, 'utf-8'))
  // CLI 提供的 managed settings 作为 policy tier 的一部分（最高优先级）
  mergedSettings = mergeWith(mergedSettings, parsed, mergeCustomizer)
}
```

实际接通方式需根据现有 settings tier 传递机制调整。如果 settings.ts 不直接读 process.env.CLI_MANAGED_SETTINGS，需要在 `src/main.tsx` 的 preAction/action hook 中把 `program.opts().managedSettings` 传递给 settings 加载函数。

- [ ] **Step 7：补充行为测试（可选但建议）**

在 `managed-settings.test.ts` 加一个测试，验证传入 managed-settings 后 settings 加载结果包含对应字段。

- [ ] **Step 8：跑 precheck 子集验证**

Run: `bun run typecheck && bun test src/utils/settings/`
Expected: 零错误。

- [ ] **Step 9：commit**

```bash
git add src/main.tsx src/utils/settings/settings.ts src/utils/settings/__tests__/managed-settings.test.ts
git commit -m "feat(sdk): add --managed-settings flag for policy-tier settings"
```

---

### Task 7：修补 `--porcelain` flag

**Files:**
- Modify: `src/main.tsx`
- Modify: `src/cli/print.ts`
- Test: `src/cli/__tests__/sdk-flags.test.ts`

**接通方案：** 新增 boolean Commander option。在 print 模式下，`porcelain=true` 时输出层切换为机器友好模式：禁用颜色、固定字段顺序、ASCII 分隔符（参考 git porcelain 设计）。仅影响 `output-format=text` 模式；`stream-json` 已天然 porcelain。

- [ ] **Step 1：写失败测试**

Create `src/cli/__tests__/sdk-flags.test.ts`：

```typescript
import { describe, expect, test } from 'bun:test'
import { Command } from '@commander-js/extra-typings'

function createTestProgram(): Command {
  const program = new Command()
  program
    .name('claude-code')
    .exitOverride()
    .configureOutput({ writeErr: () => {}, writeOut: () => {} })
    .option('--porcelain', 'Machine-friendly stable output (no colors, fixed field order)')
    .option('--thinking-display <mode>', 'Thinking display mode')
    .option('--session-mirror <path>', 'Mirror session transcript to file')
  return program
}

describe('--porcelain flag', () => {
  test('sets porcelain true', () => {
    const program = createTestProgram()
    program.parse(['node', 'test', '--porcelain'])
    expect(program.opts().porcelain).toBe(true)
  })

  test('absent by default', () => {
    const program = createTestProgram()
    program.parse(['node', 'test'])
    expect(program.opts().porcelain).toBeUndefined()
  })
})

// --thinking-display 和 --session-mirror 的解析测试也放在这里
describe('--thinking-display flag', () => {
  test('accepts mode value', () => {
    const program = createTestProgram()
    program.parse(['node', 'test', '--thinking-display', 'visible'])
    expect(program.opts().thinkingDisplay).toBe('visible')
  })
})

describe('--session-mirror flag', () => {
  test('accepts path', () => {
    const program = createTestProgram()
    program.parse(['node', 'test', '--session-mirror', '/tmp/session.jsonl'])
    expect(program.opts().sessionMirror).toBe('/tmp/session.jsonl')
  })
})
```

- [ ] **Step 2：跑测试看失败**

Run: `bun test src/cli/__tests__/sdk-flags.test.ts`
Expected: FAIL — options 不存在。

- [ ] **Step 3：在 src/main.tsx 加 4 个 option（一次性补齐 Phase 2 全部 flag 的 Commander 注册）**

在 `--setting-sources`（约 1406 行）之后插入：

```typescript
    .option('--porcelain', 'Machine-friendly stable output (no colors, fixed field order)', () => true)
    .option('--session-mirror <path>', 'Mirror session transcript to the specified file path')
    .option('--thinking-display <mode>', 'Thinking display mode (visible, hidden, summary)')
    .option(
      '--managed-settings <file-or-json>',
      'Policy-tier settings file path or JSON string (highest priority, overrides user/project/local)',
    )
```

- [ ] **Step 4：跑测试看通过**

Run: `bun test src/cli/__tests__/sdk-flags.test.ts`
Expected: 全部 PASS（porcelain、thinking-display、session-mirror 解析）。

- [ ] **Step 5：在 print.ts 接通 porcelain 行为**

Read `src/cli/print.ts:600-810`（outputFormat 处理段）。

在 `outputFormat === 'text'` 分支中，加入 porcelain 检测。参考实现：

```typescript
const isPorcelain = options.porcelain === true

if (isPorcelain) {
  // 禁用 ANSI 颜色（chalk.NO_COLOR 已自动处理，但显式确认）
  process.env.FORCE_COLOR = '0'
}

// 在最终 writeToStdout 调用前，如果 porcelain 模式：
// - 去除装饰性输出（如分隔线、空行、装饰性 emoji）
// - 固定字段顺序（如 result 输出按字段名字母序）
// - 使用 ASCII 分隔符（如 \x1f 单元分隔符、\x1e 记录分隔符）
```

注意：**porcelain 仅影响 text 模式输出装饰**，不改变消息内容。最小实现可以仅设 `FORCE_COLOR=0` + 关闭 verbose 装饰，未来再细化。

- [ ] **Step 6：跑 typecheck**

Run: `bun run typecheck`
Expected: 零错误。

- [ ] **Step 7：commit**

```bash
git add src/main.tsx src/cli/print.ts src/cli/__tests__/sdk-flags.test.ts
git commit -m "feat(sdk): add --porcelain flag for machine-friendly text output"
```

---

### Task 8：接通 `--session-mirror` 行为

> Commander 注册已在 Task 7 完成。本 Task 只接通行为。

**Files:**
- Modify: `src/utils/sessionStorage.ts`
- Modify: `src/main.tsx`（透传 option 到全局）
- Test: `src/utils/__tests__/session-mirror.test.ts`

**接通方案：** 在 `recordTranscript()`（`sessionStorage.ts:1431`）写入本地 transcript 后，dual-write 到 `--session-mirror` 指定的文件。每条消息以 JSONL 追加。

- [ ] **Step 1：写失败测试**

Create `src/utils/__tests__/session-mirror.test.ts`：

```typescript
import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { existsSync, readFileSync, rmSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('--session-mirror dual-write', () => {
  let mirrorPath: string
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'session-mirror-'))
    mirrorPath = join(tmpDir, 'mirror.jsonl')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('mirror file receives appended JSONL on recordTranscript', async () => {
    // 设置 mirror path（通过模块级 setter 或 process.env）
    const { setSessionMirrorPath } = await import('src/utils/sessionStorage.js')
    setSessionMirrorPath(mirrorPath)

    const { recordTranscript } = await import('src/utils/sessionStorage.js')
    // 用最小消息调用 recordTranscript
    // 注意：recordTranscript 依赖 getSessionId() / getProject()，可能需要 mock

    // 期望：mirror 文件存在且包含至少一行 JSON
    expect(existsSync(mirrorPath)).toBe(true)
    const content = readFileSync(mirrorPath, 'utf-8').trim()
    const lines = content.split('\n')
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow()
    }

    setSessionMirrorPath(null)
  })
})
```

注意：实际测试可能需要 mock `getSessionId()` / `getProject()`，参考 `src/services/acp/__tests__/agent.test.ts` 的 mock 模式。

- [ ] **Step 2：跑测试看失败**

Run: `bun test src/utils/__tests__/session-mirror.test.ts`
Expected: FAIL — `setSessionMirrorPath` 不存在。

- [ ] **Step 3：在 sessionStorage.ts 加 setter + dual-write**

Read `src/utils/sessionStorage.ts:1431-1470`（`recordTranscript` 函数）。

在文件顶部加：

```typescript
let sessionMirrorPath: string | null = null

export function setSessionMirrorPath(path: string | null): void {
  sessionMirrorPath = path
}

export function getSessionMirrorPath(): string | null {
  return sessionMirrorPath
}
```

在 `recordTranscript` 函数末尾（在 `return ...` 之前），加 dual-write：

```typescript
if (sessionMirrorPath) {
  try {
    const { appendFile } = await import('node:fs/promises')
    const lines = newMessages.map(m => JSON.stringify(m)).join('\n')
    await appendFile(sessionMirrorPath, lines + '\n', 'utf-8')
  } catch (err) {
    // Best-effort: mirror 失败不影响主流程
    console.error(`[session-mirror] failed to write: ${(err as Error).message}`)
  }
}
```

- [ ] **Step 4：在 main.tsx 透传 CLI option 到 setter**

在 `src/main.tsx` 的 action handler（或 preAction hook）中，解析到 `--session-mirror` 后调用 setter：

```typescript
const opts = program.opts()
if (opts.sessionMirror) {
  const { setSessionMirrorPath } = await import('src/utils/sessionStorage.js')
  setSessionMirrorPath(opts.sessionMirror)
}
```

具体插入位置：参考 `src/main.tsx` 现有 settings 加载位置（约 645-667 行 `--settings` 处理段）的模式。

- [ ] **Step 5：跑测试看通过**

Run: `bun test src/utils/__tests__/session-mirror.test.ts`
Expected: PASS。

- [ ] **Step 6：commit**

```bash
git add src/utils/sessionStorage.ts src/main.tsx src/utils/__tests__/session-mirror.test.ts
git commit -m "feat(sdk): wire --session-mirror to dual-write transcript"
```

---

### Task 9：接通 `--thinking-display` 行为

> Commander 注册已在 Task 7 完成。本 Task 只接通行为。

**Files:**
- Modify: `src/utils/thinking.ts`
- Modify: `src/main.tsx`
- Modify: `src/utils/streamlinedTransform.ts`
- Test: `src/utils/__tests__/thinking-display.test.ts`

**接通方案：** ccb 现有 `ThinkingConfig`（`thinking.ts:11`）控制 thinking 是否启用 + budget。`--thinking-display` 控制 thinking 内容的**显示**（visible / hidden / summary），不影响 API 请求。最小实现：把 `thinkingDisplay` 作为单独字段透传，在输出层（stream-json / text）按 mode 过滤或处理 thinking block。

- [ ] **Step 1：读现有 thinking 实现**

Run:
```bash
grep -nE "ThinkingConfig|thinking_display|thinkingDisplay|enabled.*thinking|disabled.*thinking" src/utils/thinking.ts src/services/api/claude.ts | head -20
```

记录 `ThinkingConfig` 类型定义、`thinkingConfig` 在 API 调用中的传参路径。

- [ ] **Step 2：写失败测试**

Create `src/utils/__tests__/thinking-display.test.ts`：

```typescript
import { describe, expect, test } from 'bun:test'

describe('--thinking-display mode parsing', () => {
  test('accepts visible / hidden / summary values', async () => {
    const { parseThinkingDisplay } = await import('src/utils/thinking.js')
    expect(parseThinkingDisplay('visible')).toBe('visible')
    expect(parseThinkingDisplay('hidden')).toBe('hidden')
    expect(parseThinkingDisplay('summary')).toBe('summary')
  })

  test('default is summary when not specified', async () => {
    const { parseThinkingDisplay } = await import('src/utils/thinking.js')
    expect(parseThinkingDisplay(undefined)).toBe('summary')
  })

  test('throws on invalid value', async () => {
    const { parseThinkingDisplay } = await import('src/utils/thinking.js')
    expect(() => parseThinkingDisplay('invalid')).toThrow()
  })
})
```

- [ ] **Step 3：跑测试看失败**

Run: `bun test src/utils/__tests__/thinking-display.test.ts`
Expected: FAIL — `parseThinkingDisplay` 不存在。

- [ ] **Step 4：在 thinking.ts 加 display mode**

在 `src/utils/thinking.ts` 顶部附近加：

```typescript
export type ThinkingDisplayMode = 'visible' | 'hidden' | 'summary'

export function parseThinkingDisplay(value: string | undefined): ThinkingDisplayMode {
  if (value === undefined || value === '') return 'summary'
  if (value === 'visible' || value === 'hidden' || value === 'summary') return value
  throw new Error(`Invalid --thinking-display value: ${value}. Must be visible, hidden, or summary.`)
}

let currentThinkingDisplay: ThinkingDisplayMode = 'summary'

export function setThinkingDisplay(mode: ThinkingDisplayMode): void {
  currentThinkingDisplay = mode
}

export function getThinkingDisplay(): ThinkingDisplayMode {
  return currentThinkingDisplay
}
```

- [ ] **Step 5：跑测试看通过**

Run: `bun test src/utils/__tests__/thinking-display.test.ts`
Expected: PASS。

- [ ] **Step 6：在 main.tsx 透传 CLI option 到 setter**

在 `src/main.tsx` action handler 中：

```typescript
const opts = program.opts()
if (opts.thinkingDisplay) {
  const { parseThinkingDisplay, setThinkingDisplay } = await import('src/utils/thinking.js')
  setThinkingDisplay(parseThinkingDisplay(opts.thinkingDisplay))
}
```

- [ ] **Step 7：在输出层应用 display mode（最小实现）**

在 `src/utils/streamlinedTransform.ts` 或 `src/cli/print.ts` 中，在输出 assistant message 前，根据 `getThinkingDisplay()` 过滤 thinking block：

```typescript
import { getThinkingDisplay } from 'src/utils/thinking.js'

function filterThinkingBlocks(message: SDKAssistantMessage): SDKAssistantMessage {
  const mode = getThinkingDisplay()
  if (mode === 'visible') return message  // 不过滤
  if (mode === 'hidden') {
    // 移除所有 thinking / redacted_thinking blocks
    return {
      ...message,
      message: {
        ...message.message,
        content: message.message.content.filter(
          (b: { type: string }) => b.type !== 'thinking' && b.type !== 'redacted_thinking',
        ),
      },
    }
  }
  // mode === 'summary'：保留 thinking block 但截断到首 N 字符 + '...'
  // 最小实现先等同 visible，未来再细化
  return message
}
```

具体接入点：参考 `src/utils/streamlinedTransform.ts` 现有的 message 转换逻辑。

- [ ] **Step 8：跑 precheck 子集**

Run: `bun run typecheck && bun test src/utils/thinking.ts src/utils/__tests__/thinking-display.test.ts`
Expected: 零错误。

- [ ] **Step 9：commit**

```bash
git add src/utils/thinking.ts src/main.tsx src/utils/streamlinedTransform.ts src/utils/__tests__/thinking-display.test.ts
git commit -m "feat(sdk): wire --thinking-display to thinking block filtering"
```

---

## Phase 3：按 gap matrix 修补 P0 / 轻量 P1

> **本 Phase 是动态的。** Task 10 是决策框架；Task 11+ 数量由 gap matrix 决定。每个修补一个 Task，严格 TDD，独立 commit。

### Task 10：按 gap matrix 决策修补清单

**Files:**
- Read: `docs/sdk-integration/gap-matrix.md`

- [ ] **Step 1：读 gap matrix 的「修补候选清单」段**

Run: 读 `docs/sdk-integration/gap-matrix.md` 中「修补候选清单」段。

- [ ] **Step 2：按 spec 判定闸门分级**

对每条 ⚠️/❌（除 Phase 2 已处理的 4 个 CLI flag），按下面判定：

```
P0（必修）             → 列入本 Phase 必做
P1 工作量 ≤ L（1-2 文件、< 50 行） → 列入本 Phase 必做
P1 工作量 M/L          → 输出"待用户决策"清单，**暂停**等用户决定
P2（@alpha / 边缘）    → 跳过，文档化"已知 gap"
```

- [ ] **Step 3：为本 Phase 每个 P0 / 轻量 P1 创建 Task**

每条修补创建一个独立 Task，模板：

```markdown
### Task N：修补 <gap 标题>

**Files:**
- Modify: <文件:行>
- Test: <测试文件>

**Gap 描述：** <从 gap matrix 引用>

**接通方案：** <具体方案>

- [ ] Step 1：写失败测试
- [ ] Step 2：跑测试看失败
- [ ] Step 3：写实现
- [ ] Step 4：跑测试看通过
- [ ] Step 5：更新 gap matrix 把对应条目从 ⚠️/❌ 改为 ✅
- [ ] Step 6：commit
```

- [ ] **Step 4：执行每个 Task**

按创建顺序执行。每个 Task 完成后：
1. 更新 `docs/sdk-integration/gap-matrix.md` 对应条目状态
2. 跑 `bun run typecheck && bun test <相关测试>`
3. Conventional Commits 格式提交

- [ ] **Step 5：完成所有 Task 后更新 gap matrix**

在「修补候选清单」段顶部加：

```markdown
> **状态：Phase 3 完成于 <日期>。** P0 和轻量 P1 已修补；P1-M/L 见「待用户决策」段；P2 见「已知 gap」段。
```

- [ ] **Step 6：commit gap matrix 状态更新**

```bash
git add docs/sdk-integration/gap-matrix.md
git commit -m "docs(sdk): mark Phase 3 gap repairs complete in gap matrix"
```

---

## Phase 4：SDK 集成 smoke test

### Task 11：创建 sdk-backend.test.ts 骨架 + T1 握手测试

**Files:**
- Create: `tests/integration/sdk-backend.test.ts`

**测试架构：** spawn `dist/cli-node.js` 跑 `--print --output-format=stream-json --input-format=stream-json`，stdin 喂 SDKUserMessage JSONL，stdout 收集 SDKMessage JSONL。用 mock provider 避免 real API 调用。

- [ ] **Step 1：确保 dist/cli-node.js 存在**

Run: `ls -la dist/cli-node.js`
Expected: 文件存在。如果不存在，跑 `bun run build` 生成。

- [ ] **Step 2：写 T1 测试**

Create `tests/integration/sdk-backend.test.ts`：

```typescript
import { describe, expect, test, beforeAll } from 'bun:test'
import { spawn } from 'node:child_process'
import { resolve, join } from 'node:path'
import { existsSync } from 'node:fs'

const CLI_NODE_PATH = resolve(process.cwd(), 'dist/cli-node.js')

beforeAll(() => {
  if (!existsSync(CLI_NODE_PATH)) {
    throw new Error(`dist/cli-node.js not found. Run "bun run build" first.`)
  }
})

/**
 * Spawn ccb in SDK print mode and return the child process handle.
 * Uses CLAUDE_CODE_USE_OPENAI=1 + OPENAI_BASE_URL=fake to avoid real API calls.
 */
function spawnCcbSdk(args: string[] = []) {
  const defaultArgs = [
    '--print',
    '--output-format=stream-json',
    '--input-format=stream-json',
    '--verbose',
    '--permission-mode', 'bypassPermissions',
    '--allow-dangerously-skip-permissions',
    '--no-session-persistence',
  ]
  return spawn('node', [CLI_NODE_PATH, ...defaultArgs, ...args], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      // 用 fake provider 避免真实 API 调用
      CLAUDE_CODE_USE_OPENAI: '1',
      OPENAI_API_KEY: 'sk-fake-key-for-testing',
      OPENAI_BASE_URL: 'http://127.0.0.1:0',  // 必然失败，但能触发握手
      OPENAI_MODEL: 'gpt-4o',
    },
  })
}

/**
 * 解析 stdout JSONL 流，按行收集 JSON 对象。
 */
function collectStdoutMessages(child: ReturnType<typeof spawnCcbSdk>): Promise<any[]> {
  return new Promise((resolve) => {
    const messages: any[] = []
    let buffer = ''
    child.stdout!.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf-8')
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          messages.push(JSON.parse(trimmed))
        } catch {
          // 非 JSON 行，忽略
        }
      }
    })
    child.on('close', () => resolve(messages))
  })
}

describe('SDK backend integration: T1 handshake + single turn', () => {
  test('ccb starts in stream-json mode and emits SDK init/system message', async () => {
    const child = spawnCcbSdk()

    // 发一个最简 user message
    const userMsg = {
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: 'hello' }] },
    }
    child.stdin!.write(JSON.stringify(userMsg) + '\n')
    child.stdin!.end()

    const messages = await collectStdoutMessages(child)

    // 期望：至少收到一条消息（可能是 system init 或 result error，因为 API 会失败）
    expect(messages.length).toBeGreaterThan(0)

    // 期望：消息能解析为 SDK 已知类型之一
    const validTypes = [
      'system', 'assistant', 'user', 'result',
      'stream_event', 'partial_message',
    ]
    const firstMsg = messages[0]
    expect(validTypes).toContain(firstMsg.type)
  }, 15000)
})
```

- [ ] **Step 3：跑测试看是否通过**

Run: `bun test tests/integration/sdk-backend.test.ts`
Expected: 通过（即使 API 调用失败，ccb 也应输出 result error 消息）。

如果测试失败，原因可能是：
- `dist/cli-node.js` 不存在 → 跑 `bun run build`
- ccb 启动时报 unknown option → 检查 `--no-session-persistence` 等参数是否被识别
- stream-json 解析问题 → 检查 stdout 输出是否被其他 console.log 污染（`streamJsonStdoutGuard.ts` 应该处理）

- [ ] **Step 4：commit**

```bash
git add tests/integration/sdk-backend.test.ts
git commit -m "test(sdk): add T1 handshake integration test for SDK backend"
```

---

### Task 12：T2 flag 不报 unknown

**Files:**
- Modify: `tests/integration/sdk-backend.test.ts`

- [ ] **Step 1：加 T2 测试**

在 `tests/integration/sdk-backend.test.ts` 加：

```typescript
describe('SDK backend integration: T2 no unknown-option errors', () => {
  // 41 个 SDK 期望的 flag
  const SDK_FLAGS = [
    '--add-dir', '/tmp',
    '--agent', 'default',
    '--allow-dangerously-skip-permissions',
    '--betas', 'foo',
    '--continue',
    '--debug',
    '--debug-to-stderr',
    '--effort', 'high',
    '--fallback-model', 'claude-sonnet-4-6',
    '--fork-session',
    '--hard-fail',
    '--include-hook-events',
    '--include-partial-messages',
    '--input-format', 'stream-json',
    '--json-schema', '{"type":"object"}',
    '--managed-settings', '{"foo":"bar"}',
    '--max-budget-usd', '5',
    '--max-thinking-tokens', '1024',
    '--max-turns', '1',
    '--mcp-config', '{}',
    '--model', 'claude-sonnet-4-6',
    '--no-session-persistence',
    '--output-format', 'stream-json',
    '--permission-mode', 'bypassPermissions',
    '--plugin-dir', '/tmp',
    '--porcelain',
    '--resume',
    '--session-id', '00000000-0000-0000-0000-000000000001',
    '--session-mirror', '/tmp/mirror.jsonl',
    '--strict-mcp-config',
    '--task-budget', '1000',
    '--thinking', 'enabled',
    '--thinking-display', 'visible',
    '--tools', 'Read',
    '--verbose',
  ]

  test('ccb accepts all SDK flags without erroring on unknown option', async () => {
    // 用 --version 模式跑：ccb 应该不报 unknown option 就退出
    // 但 --version 是 fast-path，不会真正解析其他 flag。
    // 改用 -p + immediate stdin close：ccb 会跑握手后退出，stderr 不应有 unknown option 错。
    const child = spawnCcbSdk(SDK_FLAGS)
    child.stdin!.end()

    let stderrOutput = ''
    child.stderr!.on('data', (chunk: Buffer) => {
      stderrOutput += chunk.toString('utf-8')
    })

    await new Promise<void>((resolve) => child.on('close', () => resolve()))

    // 期望 stderr 不包含 "unknown option" 或 "error: unknown"
    expect(stderrOutput.toLowerCase()).not.toContain('unknown option')
    expect(stderrOutput.toLowerCase()).not.toContain('error: unknown')
  }, 15000)
})
```

- [ ] **Step 2：跑测试看是否通过**

Run: `bun test tests/integration/sdk-backend.test.ts`
Expected: 通过。如果失败，stderr 中会指出具体哪个 flag 是 unknown，回到 Phase 2/3 修补对应 flag。

- [ ] **Step 3：commit**

```bash
git add tests/integration/sdk-backend.test.ts
git commit -m "test(sdk): add T2 — verify no unknown-option errors for SDK flags"
```

---

### Task 13：T3 canUseTool callback

**Files:**
- Modify: `tests/integration/sdk-backend.test.ts`

- [ ] **Step 1：加 T3 测试**

在 `tests/integration/sdk-backend.test.ts` 加：

```typescript
describe('SDK backend integration: T3 canUseTool callback', () => {
  test.skip('ccb honors permission-prompt-tool for canUseTool callbacks', async () => {
    // 此测试需要：
    // 1. 启动一个 mock MCP server 暴露 permission-prompt-tool
    // 2. 通过 --mcp-config 注册它
    // 3. 通过 --permission-prompt-tool 指定它
    // 4. 发一个会触发工具调用的 prompt
    // 5. 期望 ccb 调用 mock MCP server 的 permission tool
    // 工作量较大（M），放到 Phase 3 决策
  })
})
```

注意：T3 实际实现工作量较大（需要 mock MCP server）。先 skip 并记录为 P1-M/L，留待用户决策。

- [ ] **Step 2：commit**

```bash
git add tests/integration/sdk-backend.test.ts
git commit -m "test(sdk): stub T3 canUseTool test (P1-M/L, skip until prioritized)"
```

---

### Task 14：T4 abortController

**Files:**
- Modify: `tests/integration/sdk-backend.test.ts`

- [ ] **Step 1：加 T4 测试**

在 `tests/integration/sdk-backend.test.ts` 加：

```typescript
describe('SDK backend integration: T4 process kills cleanly on SIGTERM', () => {
  test('ccb exits with non-zero code on SIGTERM', async () => {
    const child = spawnCcbSdk()

    // 不发任何输入，等 500ms 让进程启动
    await new Promise((r) => setTimeout(r, 500))

    // 发 SIGTERM（模拟 SDK abortController）
    child.kill('SIGTERM')

    const exitCode = await new Promise<number>((resolve) => {
      child.on('close', (code) => resolve(code ?? 0))
    })

    // 期望：进程退出（exit code 任意，但应在合理时间内）
    expect(exitCode).toBeDefined()
  }, 10000)
})
```

- [ ] **Step 2：跑测试看是否通过**

Run: `bun test tests/integration/sdk-backend.test.ts`
Expected: 通过。

- [ ] **Step 3：commit**

```bash
git add tests/integration/sdk-backend.test.ts
git commit -m "test(sdk): add T4 — verify clean exit on SIGTERM"
```

---

## Phase 5：package.json exports + 文档

### Task 15：package.json 加 exports 字段

**Files:**
- Modify: `package.json`

- [ ] **Step 1：读现有 package.json**

确认现有字段：`name` / `version` / `bin` / `files`。当前无 `exports`。

- [ ] **Step 2：加 exports 字段**

在 `bin` 字段之后、`workspaces` 之前插入：

```jsonc
  "exports": {
    ".": {
      "default": "./dist/cli-node.js"
    },
    "./sdk": {
      "default": "./dist/cli-node.js"
    },
    "./package.json": "./package.json"
  },
```

注意：因 `dist/cli-node.js` 无对应 `.d.ts`，先省略 `types` 字段。

- [ ] **Step 3：验证 require.resolve 可用**

Run:
```bash
bun -e "console.log(require.resolve('claude-code-best/sdk'))"
```
Expected: 输出绝对路径 `<repo>/dist/cli-node.js`。

如果项目根目录就是 `claude-code-best` 包本身，需要先 `bun link` 或在子目录测试。

- [ ] **Step 4：跑 typecheck**

Run: `bun run typecheck`
Expected: 零错误。

- [ ] **Step 5：commit**

```bash
git add package.json
git commit -m "feat(sdk): add package.json exports for SDK backend consumption"
```

---

### Task 16：写 docs/sdk-integration.md

**Files:**
- Create: `docs/sdk-integration.md`

- [ ] **Step 1：写文档**

Create `docs/sdk-integration.md`：

```markdown
---
title: Using ccb as @anthropic-ai/claude-agent-sdk backend
description: Switch the official Claude Agent SDK to spawn ccb as the Claude Code subprocess
---

# Using ccb as @anthropic-ai/claude-agent-sdk backend

ccb is a drop-in replacement for the Claude Code CLI when called from `@anthropic-ai/claude-agent-sdk`.

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

ccb supports the full SDK Options surface. See `docs/sdk-integration/gap-matrix.md` for the complete alignment matrix.

## Environment variables

The following SDK-defined environment variables are honored:

- `CLAUDE_CODE_DIAGNOSTICS_FILE` — write diagnostics to file
- `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` — disable telemetry
- `CLAUDE_CODE_USE_BEDROCK` / `CLAUDE_CODE_USE_VERTEX` / `CLAUDE_CODE_USE_FOUNDRY` — switch API provider
- `CLAUDE_CONFIG_DIR` — override config directory
- `CLAUDE_AGENT_SDK_CLIENT_APP` (set inside `env` option) — User-Agent identifier

## Limitations

The following SDK options are @alpha and not yet supported:

- `sessionStore` / `sessionStoreFlush` / `loadTimeoutMs`

See `docs/sdk-integration/gap-matrix.md` for the complete list of known gaps.

## Troubleshooting

### "unknown option" error

If you see `error: unknown option --<flag>`, your ccb version is older than the SDK version. Update ccb and check `docs/sdk-integration/gap-matrix.md` for current alignment.

### Process crashes on startup

Check stderr output. Common causes:
- Missing `--allow-dangerously-skip-permissions` when using `permissionMode: 'bypassPermissions'`
- Missing `--verbose` when using `outputFormat: 'stream-json'`

### stream-json output is malformed

ccb writes ONLY JSONL to stdout. If something else writes to stdout, file a bug — `streamJsonStdoutGuard.ts` should prevent this.
```

- [ ] **Step 2：commit**

```bash
git add docs/sdk-integration.md
git commit -m "docs(sdk): write user-facing SDK integration guide"
```

---

### Task 17：CLAUDE.md 加 SDK Integration 段

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1：在 CLAUDE.md 合适位置加段**

在 `### Multi-API 兼容层` 之后、`### 穷鬼模式（Budget Mode）` 之前插入：

```markdown
### SDK Backend Mode

ccb 可作为 `@anthropic-ai/claude-agent-sdk` 的后端。用户在 SDK 代码里设置 `pathToClaudeCodeExecutable: require.resolve('claude-code-best/sdk')` 即可让 SDK spawn ccb 替代官方 Claude Code 二进制。

- 入口：`dist/cli-node.js`（Node 兼容版本，shebang `#!/usr/bin/env node`）
- 协议：基于 `--print --output-format=stream-json --input-format=stream-json` 的 JSONL 双向通信
- 协议契约：`src/entrypoints/sdk/`（vendored SDK 类型）
- 对齐状态：`docs/sdk-integration/gap-matrix.md`（CLI flag / Options / 消息类型三表）
- 用户文档：`docs/sdk-integration.md`

ccb 支持完整 SDK Options 表面（含 `taskBudget`、`effort`、`outputFormat`、`sandbox`、`hooks` 等）。
```

- [ ] **Step 2：commit**

```bash
git add CLAUDE.md
git commit -m "docs: add SDK Backend Mode section to CLAUDE.md"
```

---

## Phase 6：整体验证

### Task 18：跑 precheck 整体验证

- [ ] **Step 1：跑 typecheck**

Run: `bun run typecheck`
Expected: 零错误。

- [ ] **Step 2：跑 lint fix**

Run: `bun run check:fix`
Expected: 零错误。

- [ ] **Step 3：跑所有测试**

Run: `bun test`
Expected: 全部 PASS（含 sdk-backend.test.ts）。

- [ ] **Step 4：跑 precheck（合一）**

Run: `bun run precheck`
Expected: 零错误。

- [ ] **Step 5：如果有任何错误，回到对应 Task 修复**

不要在 precheck 失败时强行提交。修复后重新跑 precheck 直到零错误。

- [ ] **Step 6：标记 plan 完成**

在 plan 顶部加：

```markdown
> **Status: Complete** — All tasks executed and verified via `bun run precheck`.
```

- [ ] **Step 7：最终 commit**

```bash
git add docs/superpowers/plans/2026-06-13-claude-agent-sdk-backend.md
git commit -m "docs(sdk): mark implementation plan complete"
```

---

## Self-Review

**1. Spec coverage（对照 spec 第 9 节交付物清单）：**

| Spec 交付物 | 对应 Task |
|---|---|
| 1. `docs/sdk-integration/gap-matrix.md` | Task 1-5 |
| 2. `docs/sdk-integration.md` | Task 16 |
| 3. 4 个 CLI flag 修补 + 单元测试 | Task 6-9 |
| 4. P0/P1（≤ L）的修补 | Task 10（动态） |
| 5. `tests/integration/sdk-backend.test.ts` | Task 11-14 |
| 6. `package.json` 加 `exports` | Task 15 |
| 7. `CLAUDE.md` 新增段 | Task 17 |
| 8. Conventional Commits | 所有 Task 的 commit step |

**2. Placeholder scan：**

- Task 10 的"动态修补"是流程定义，不是 placeholder——执行者按 spec 判定闸门和 Task 模板执行。
- Task 13（T3）的 `.skip()` 是有意为之（spec 第 5 节说"T5/T6 视审计阶段结果调整"，T3 同理——canUseTool 需要 mock MCP server，工作量较大），不是 placeholder。
- 所有 step 都有具体代码或具体命令。

**3. Type consistency：**

- `parseThinkingDisplay` 在 Task 9 Step 4 定义，Task 9 Step 6 调用，一致。
- `setSessionMirrorPath` / `getSessionMirrorPath` 在 Task 8 Step 3 定义，Task 8 Step 4 调用，一致。
- Commander option 名 `sessionMirror` / `thinkingDisplay` / `managedSettings` / `porcelain` 在 Task 6/7/8/9 一致使用 camelCase。

**4. 范围一致性：**

- Phase 2 只修补 4 个缺失 CLI flag（跟 spec 表 A 一致）。
- Phase 3 处理 gap matrix 中其余 ⚠️/❌ 项（不预填具体清单，跟 spec "按审计结果"一致）。
- Phase 4 实现 spec 第 5 节的 T1-T4（T3 标 skip 等待 P1-M/L 决策，跟 spec 第 5 节"T5/T6 视审计阶段结果调整"同理）。
- Phase 5 实现 spec 第 6 节的 exports + 文档。

---

## 执行建议

- Phase 1 是审计工作，没有代码改动，可以快速推进。完成后**必须暂停**让用户审核 gap matrix。
- Phase 2 每个 flag 是独立 commit，可以并行 review。
- Phase 3 取决于审计结果，可能很小（如果 ccb 已基本完整）或较大（如果发现多个未接通 option）。
- Phase 4 T1-T2 必做，T3/T4 视情况。
- Phase 5 是文档收尾，最后做。
- Phase 6 整体 precheck 是质量门。
