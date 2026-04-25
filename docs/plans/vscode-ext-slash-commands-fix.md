# VSCode Extension — Slash Commands 统一架构设计

**日期**: 2026-04-25
**分支**: feat/vscode-extension
**状态**: 待确认

---

## 1. 问题陈述

VSCode 扩展中输入 `/` 后命令菜单显示 "No matching command (got 0 total)"，用户无法发现和选择任何 slash command。

## 2. 根因分析

### 2.1 直接原因

`src/services/acp/agent.ts:729-734` 的 `sendAvailableCommandsUpdate()` 方法仅发送 `cmd.type === 'prompt'` 类型的命令：

```typescript
// agent.ts:729-734 — 当前代码
const availableCommands = session.commands
  .filter(
    cmd =>
      cmd.type === 'prompt' &&
      !cmd.isHidden &&
      cmd.userInvocable !== false,
  )
```

### 2.2 命令类型分布

CLI 注册的约 114 个命令中：

| 类型 | 数量 | 过滤器结果 |
|------|------|-----------|
| `local` | ~34 | ❌ 全部丢弃 |
| `local-jsx` | ~70 | ❌ 全部丢弃 |
| `prompt` | ~10 | ✅ 保留 |

10 个 `prompt` 类型命令中，`commit` 和 `commit-push-pr` 在 `INTERNAL_ONLY_COMMANDS`（需 `USER_TYPE=ant`），`init-verifiers` 是 `isHidden`，最终到达 webview 的命令接近 0。

### 2.3 架构确认（6 agent 独立审计）

- **通信架构**：单通道 ACP over stdio，干净无混合协议
- **执行路径**：ACP `prompt()` → `QueryEngine.submitMessage()` → `processUserInput()` → `processSlashCommand()` 能分派**所有三种类型**的命令
- **问题范围**：纯粹是命令列表的**发现/展示层**过滤过窄，不涉及执行层

### 2.4 三种类型在 ACP 模式下的执行行为

| 类型 | 机制 | ACP 现状 |
|------|------|---------|
| `prompt` | `getPromptForCommand()` → API 调用 | ✅ 完全正常 |
| `local` | `load()` → `mod.call()` → 文本/compact/skip | ✅ 正常（`supportsNonInteractive: false` 的返回 skip） |
| `local-jsx` | `load()` → `mod.call(onDone, ctx, args)` → JSX | ⚠️ `isNonInteractiveSession: true` 导致 JSX 被丢弃（`processSlashCommand.tsx:820-825`） |

`local-jsx` 的两种子类型：
- **A 类（`onDone` 完成）**：`/clear`, `/compact` — 主逻辑在 `onDone` 回调中，JSX 只是 UI 反馈，ACP 下正常工作
- **B 类（依赖 Ink 交互）**：`/model`, `/config`, `/effort`, `/color` — 通过 Ink FuzzyPicker/模态框等待用户交互后才调 `onDone`，ACP 下 JSX 丢弃后 `onDone` 永远不触发，命令静默无响应

---

## 3. 设计目标

**统一机制**：所有命令通过同一路径执行，不分"webview 拦截"和"ACP 透传"两条路。

**全部可用**：114 个命令在扩展中都能工作，包括需要交互 UI 的 B 类 `local-jsx` 命令。

**不引入补丁**：不在 webview 端硬编码命令列表、不维护 `TERMINAL_ONLY_COMMANDS` 集合、不按命令名做条件分支。

---

## 4. 核心发现：ACP Elicitation 机制

ACP SDK (`@agentclientprotocol/sdk@0.19`) 已内置 `unstable_createElicitation` 协议，支持 agent 向 client 请求结构化用户输入：

```typescript
// ACP SDK 已有类型（schema/types.gen.d.ts）

// Agent → Client：请求用户输入
type CreateElicitationRequest = {
  mode: "form";
  message: string;                          // 人类可读提示
  requestedSchema: ElicitationSchema;       // JSON Schema 描述表单字段
  sessionId: string;
};

// 字段类型支持
type ElicitationPropertySchema =
  | { type: "string"; enum?: string[]; oneOf?: EnumOption[] }  // 单选
  | { type: "number" }
  | { type: "boolean" }                                        // 开关
  | { type: "array" }                                          // 多选

type EnumOption = { const: string; title: string };            // 带标题的选项

// Client → Agent：用户响应
type CreateElicitationResponse =
  | { action: "accept"; content: Record<string, ElicitationContentValue> }
  | { action: "decline" }
  | { action: "cancel" };
```

这个机制设计目的就是让 agent 通过标准协议向 client 请求用户交互，完美匹配 B 类 `local-jsx` 命令的需求。

---

## 5. 统一架构设计

### 5.1 统一执行路径

所有命令走同一条路径，无分支：

```
用户输入 "/xxx args"
  → PromptInput.submit()
  → useACP.sendMessage("/xxx args")
  → ext:prompt → ChatViewProvider → ACPClient.prompt()
  → CLI AcpAgent.prompt()
  → QueryEngine.submitMessage("/xxx args")
  → processUserInput() → processSlashCommand()
  → 按 type 执行：
      prompt  → getPromptForCommand() → API 调用 → 流式结果通过 sessionUpdate 回传
      local   → load() → mod.call() → 文本结果通过 bridge 回传
      local-jsx → load() → mod.call(onDone, ctx, args)
                  → 需要交互时: CLI 发 createElicitation → webview 渲染原生 UI
                  → 用户选择 → 响应回传 CLI → onDone 完成 → 结果通过 bridge 回传
```

webview 端不做任何命令级别的拦截或条件分支。`PromptInput.onSlashSelect` 对所有命令做同样的事：填入 textarea，用户按 Enter 发送。

### 5.2 改动分层

#### 第一层：命令列表修复（发现层）

解决"看不到命令"的问题。

**文件**: `src/services/acp/agent.ts`

```typescript
// sendAvailableCommandsUpdate() — 修改后
private async sendAvailableCommandsUpdate(sessionId: string): Promise<void> {
  const session = this.sessions.get(sessionId)
  if (!session) return

  const availableCommands = session.commands
    .filter(
      cmd =>
        !cmd.isHidden &&
        cmd.userInvocable !== false &&
        isCommandEnabled(cmd),
    )
    .map(cmd => ({
      name: cmd.name,
      description: cmd.description,
      input: cmd.argumentHint ? { hint: cmd.argumentHint } : undefined,
    }))

  await this.conn.sessionUpdate({
    sessionId,
    update: {
      sessionUpdate: 'available_commands_update',
      availableCommands,
    },
  })
}
```

改动要点：
- 移除 `cmd.type === 'prompt'` 过滤
- 增加 `isCommandEnabled(cmd)` 检查（`src/types/command.ts:227-229`，处理 feature flag / 环境条件）
- `AvailableCommand` 类型不变（`name`, `description`, `input`），不透传 `type`——webview 不需要知道命令的内部类型，因为执行路径统一

#### 第二层：B 类命令执行修复（交互层）

解决"需交互 UI 的命令在 ACP 模式下静默无响应"的问题。

核心思路：B 类 `local-jsx` 命令在非交互模式下不再静默丢弃，而是通过 ACP Elicitation 向 client 请求用户输入，用户在 webview 的原生 UI 中完成交互后，响应回传 CLI，`onDone` 正常触发。

##### 5.2.1 CLI 端：ACP Agent 实现 Elicitation 发送

**文件**: `src/services/acp/agent.ts`

AcpAgent 需要向 `processSlashCommand` 的执行上下文注入 elicitation 能力。当 B 类命令需要用户选择时（如 `/model` 需要选模型），命令内部调用 elicitation 函数，ACP agent 将其转为 `createElicitation` RPC 调用。

```typescript
// agent.ts — AcpAgent 新增方法
private async elicit(
  sessionId: string,
  message: string,
  schema: ElicitationSchema,
): Promise<CreateElicitationResponse> {
  return this.conn.unstable_createElicitation({
    mode: 'form',
    sessionId,
    message,
    requestedSchema: schema,
  })
}
```

##### 5.2.2 CLI 端：命令上下文注入 elicitation

**文件**: `src/services/acp/agent.ts` (prompt 方法) + `src/types/command.ts` (上下文类型)

`processSlashCommand` 的执行上下文（`ToolUseContext & LocalJSXCommandContext`）需要增加一个可选的 `elicit` 函数。ACP agent 在调用 `submitMessage` 前注入：

```typescript
// command.ts — LocalJSXCommandContext 扩展
export type LocalJSXCommandContext = {
  // ... 现有字段
  /** ACP elicitation: 向客户端请求结构化用户输入。仅在 ACP 模式下可用。 */
  elicit?: (message: string, schema: ElicitationSchema) => Promise<ElicitationResult>
}

type ElicitationResult =
  | { action: 'accept'; content: Record<string, string | number | boolean | string[]> }
  | { action: 'decline' }
  | { action: 'cancel' }
```

##### 5.2.3 CLI 端：B 类命令适配 elicitation

**以 `/model` 为例** — `src/commands/model/index.ts`（或对应文件）

当前 `/model` 的实现逻辑大致是：
1. 获取可用模型列表
2. 渲染 Ink FuzzyPicker 让用户选择
3. 用户选择后通过 `onDone` 回调设置模型

适配后：
1. 获取可用模型列表
2. 检查 `context.elicit` 是否可用（ACP 模式）
   - **有 `elicit`**：构建 elicitation schema（`type: "string", oneOf: models.map(...)`），调用 `context.elicit()`，等待响应，调 `onDone`
   - **无 `elicit`（REPL 模式）**：渲染 Ink FuzzyPicker（现有逻辑不变）
3. `onDone` 回调设置模型

```typescript
// 概念示例（实际代码结构根据命令实现调整）
async call(onDone, context, args) {
  const models = getAvailableModels()

  // 如果有参数，直接设置（已有逻辑）
  if (args.trim()) {
    const matched = models.find(m => m.id.includes(args.trim()))
    if (matched) {
      onDone({ messages: [], nextInput: undefined })
      setModel(matched.id)
      return null
    }
  }

  // ACP 模式：通过 elicitation 请求用户选择
  if (context.elicit) {
    const response = await context.elicit('Select a model', {
      type: 'object',
      properties: {
        model: {
          type: 'string',
          title: 'Model',
          oneOf: models.map(m => ({ const: m.id, title: m.name })),
        },
      },
      required: ['model'],
    })
    if (response.action === 'accept') {
      setModel(response.content.model as string)
    }
    onDone({ messages: [], nextInput: undefined })
    return null
  }

  // REPL 模式：渲染 Ink FuzzyPicker（现有逻辑）
  return <ModelPicker models={models} onSelect={(id) => { setModel(id); onDone(...) }} />
}
```

##### 5.2.4 webview 端：实现 Elicitation UI

**文件**: `packages/vscode-extension/src/ACPClient.ts`

ACPClient 在创建 `ClientSideConnection` 时注册 `unstable_createElicitation` 回调：

```typescript
// ACPClient.ts — connection 创建时
const connection = acp.createClientSideConnection(transport, {
  // ... 现有回调
  async unstable_createElicitation(params) {
    // 转发给 webview，等待用户响应
    return this.handleElicitation(params)
  },
})
```

**文件**: `packages/vscode-extension/webview/` — 新增 ElicitationDialog 组件

webview 端收到 elicitation 请求后，根据 `requestedSchema` 渲染原生表单 UI：

- `string` + `oneOf` → 下拉选择器 / 搜索列表
- `string` + `enum` → 简单下拉
- `boolean` → 开关
- 多字段 → 表单组合

用户完成选择后，响应通过 extension host 回传 CLI。

**消息协议扩展**:

`packages/vscode-extension/webview/lib/protocol.ts` 增加两个消息类型：

```typescript
// Host → Webview
interface ElicitationRequestMessage {
  type: 'ext:elicitation_request'
  payload: {
    requestId: string
    message: string
    schema: ElicitationSchema
  }
}

// Webview → Host
interface ElicitationResponseMessage {
  type: 'ext:elicitation_response'
  payload: {
    requestId: string
    action: 'accept' | 'decline' | 'cancel'
    content?: Record<string, unknown>
  }
}
```

##### 5.2.5 processSlashCommand 不再静默丢弃

**文件**: `src/utils/processUserInput/processSlashCommand.tsx`

当前 `isNonInteractiveSession` 时直接丢弃 JSX（行 820-825）。修改为：如果命令的 `onDone` 已在 `mod.call()` 执行过程中被调用（说明命令通过 elicitation 或参数直接完成了），正常返回。如果 `onDone` 未被调用且 JSX 被返回，才记录一条说明信息：

```typescript
// processSlashCommand.tsx:818-827 — 修改后
.then(jsx => {
  if (jsx == null) return
  if (doneWasCalled) return  // onDone 已触发（命令通过 elicitation 完成）
  if (context.options.isNonInteractiveSession) {
    // 命令返回了 JSX 但 onDone 未触发，说明命令依赖 Ink 交互且未适配 elicitation
    void resolve({
      messages: [{
        role: 'assistant',
        content: `Command /${command.name} requires interactive terminal UI and is not yet available in this environment.`,
      }],
      shouldQuery: false,
      command,
    })
    return
  }
  // REPL 模式：渲染 JSX（现有逻辑不变）
  if (doneWasCalled) return
  setToolJSX({ jsx, shouldHidePromptInput: true, showSpinner: false, isLocalJSXCommand: true, isImmediate: command.immediate === true })
})
```

这样未适配 elicitation 的命令也会给用户一个明确反馈，而不是静默返回空。

---

## 6. 涉及文件清单

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `src/services/acp/agent.ts` | **核心** | 移除 `type === 'prompt'` 过滤；新增 `elicit()` 方法；`prompt()` 中注入 elicitation 上下文 |
| `src/types/command.ts` | 类型扩展 | `LocalJSXCommandContext` 增加 `elicit?` 函数 |
| `src/utils/processUserInput/processSlashCommand.tsx` | 行为修复 | 非交互模式下 JSX 丢弃改为给出明确反馈（未适配的命令） |
| `src/commands/model/` | 命令适配 | 检测 `context.elicit`，ACP 模式用 elicitation 替代 FuzzyPicker |
| `src/commands/effort/` | 命令适配 | 同上（effort level 选择） |
| `src/commands/config/` | 命令适配 | 同上（配置项选择） |
| `src/commands/color/` | 命令适配 | 同上（颜色主题选择） |
| `src/commands/fast/` | 命令适配 | 同上（fast mode 切换） |
| `packages/vscode-extension/src/ACPClient.ts` | ACP 回调 | 注册 `unstable_createElicitation` 回调 |
| `packages/vscode-extension/src/ChatViewProvider.ts` | 消息路由 | elicitation 请求/响应在 host ↔ webview 间中转 |
| `packages/vscode-extension/webview/lib/protocol.ts` | 协议扩展 | 新增 `ext:elicitation_request` / `ext:elicitation_response` |
| `packages/vscode-extension/webview/lib/acp/types.ts` | 类型扩展 | 新增 ElicitationSchema 相关类型 |
| `packages/vscode-extension/webview/components/ElicitationDialog.tsx` | **新文件** | 通用 elicitation UI 组件（下拉、开关、表单） |
| `packages/vscode-extension/webview/hooks/useACP.ts` | 状态管理 | 处理 elicitation 请求/响应的 dispatch |

---

## 7. 数据流

### 7.1 普通命令（prompt / local / local-jsx A 类）

```
用户: /compact
  → webview submit("/compact")
  → ACP prompt("/compact")
  → processSlashCommand → local-jsx dispatch
  → onDone fires (compaction 完成)
  → bridge 转为 sessionUpdate
  → webview 显示结果
```

### 7.2 需交互的命令（local-jsx B 类）— 修复后

```
用户: /model
  → webview submit("/model")
  → ACP prompt("/model")
  → processSlashCommand → local-jsx dispatch
  → 命令检测 context.elicit 可用
  → 命令调用 context.elicit("Select a model", schema)
  → ACP createElicitation RPC → ACPClient 回调
  → ChatViewProvider → webview ext:elicitation_request
  → webview 渲染 ElicitationDialog（模型选择列表）
  → 用户选择 "claude-sonnet-4-6"
  → webview ext:elicitation_response → ChatViewProvider → ACPClient → CLI
  → 命令收到响应 → setModel("claude-sonnet-4-6") → onDone
  → bridge 转为 sessionUpdate
  → webview 显示 "Model set to claude-sonnet-4-6"
```

### 7.3 未适配 elicitation 的命令

```
用户: /vim
  → webview submit("/vim")
  → ACP prompt("/vim")
  → processSlashCommand → local-jsx dispatch
  → context.elicit 可用但命令未使用
  → 命令返回 JSX, onDone 未触发
  → processSlashCommand 检测: isNonInteractive + JSX 返回 + onDone 未调用
  → 返回 "Command /vim requires interactive terminal UI..."
  → webview 显示提示信息
```

---

## 8. 实施顺序

### Phase 1：命令列表修复（立即可用）

1. 修改 `agent.ts` 的 `sendAvailableCommandsUpdate` 过滤器
2. 修改 `processSlashCommand.tsx` 非交互 JSX 丢弃改为明确反馈

效果：所有命令在菜单可见。`prompt` 和 `local` 命令立即可执行。B 类 `local-jsx` 命令给出明确提示而非静默。

### Phase 2：Elicitation 基础设施

3. `ACPClient.ts` 注册 `unstable_createElicitation` 回调
4. `ChatViewProvider.ts` 消息路由
5. `protocol.ts` 协议扩展
6. `acp/types.ts` 类型扩展
7. `ElicitationDialog.tsx` 通用 UI 组件
8. `useACP.ts` 状态管理
9. `command.ts` 上下文类型扩展
10. `agent.ts` 的 `elicit()` 方法和上下文注入

效果：ACP Elicitation 通道端到端打通。

### Phase 3：命令逐步适配

11. `/model` — 最高优先级，用户最常用
12. `/effort` — effort level 选择
13. `/fast` — fast mode 切换
14. `/config` — 配置浏览/修改
15. `/color` — 颜色主题
16. 其他 B 类命令按使用频率逐步适配

每个命令的改动是独立的、渐进的：检测 `context.elicit`，ACP 模式用 elicitation，REPL 模式用现有 Ink UI。未适配的命令显示明确提示。

---

## 9. 设计优势

1. **单一执行路径**：所有命令走 ACP prompt → processSlashCommand，webview 不做命令级条件分支
2. **利用已有协议**：ACP Elicitation 是 SDK 内置机制，不是自造协议
3. **渐进适配**：Phase 1 立即解决"看不到命令"，Phase 2/3 逐步补全交互能力，每步都有独立价值
4. **CLI 不受影响**：REPL 模式代码路径不变，elicitation 是可选的上下文注入
5. **可扩展**：未来任何新的 `local-jsx` 命令只需检测 `context.elicit` 即可支持 ACP 模式，不需要 webview 端逐一适配

---

## 10. 风险评估

| 风险 | 影响 | 缓解 |
|------|------|------|
| `unstable_createElicitation` 是 experimental API，可能变更 | Elicitation 协议调整 | 通过 `_meta` 做版本协商；或封装 adapter 层隔离 SDK 变更 |
| 命令适配 elicitation 需要逐个修改 | 覆盖速度 | Phase 1 已解决"看不到命令"，适配是渐进式的；高频命令优先 |
| ElicitationDialog 需要覆盖多种字段类型 | UI 复杂度 | 先只实现 `string + oneOf`（单选列表），覆盖 80% 场景 |
| ACP SDK schema 可能拒绝 `availableCommands` 中的额外字段 | sessionUpdate 失败 | 不透传 `type`，保持原有 schema |
