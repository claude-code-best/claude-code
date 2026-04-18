# 内部限制与可解锁能力代码审计

更新时间：2026-04-15

## 目的

这份文档只基于源码做判断，回答三个问题：

1. 哪些能力是真正的 `ant-only`
2. 哪些能力其实已经对 `Claude.ai` 订阅用户可用
3. 哪些能力看起来有入口，但实际上还缺实现，不能靠开开关直接解锁

这份文档不再把“依赖 Anthropic first-party / Claude.ai / OAuth”直接等同于“内部功能”。

对当前仓库，更准确的分类是：

- `ant-only`
- `subscriber-available`
- `subscriber-remote`
- `available-in-build`
- `stub/incomplete`

## 执行摘要

### 已经基本可用

下面这些从当前源码看，不该再归类为“内部功能”：

- `assistant`
- `brief`
- `proactive`
- `voice`
- `chrome` / Claude in Chrome

原因：

- 它们不是 `USER_TYPE==='ant'` 才能注册
- 其中多条路径已经在默认 build 中编入
- 它们的主要门槛是 `Claude.ai` 订阅、OAuth、环境依赖，而不是内部员工身份

### 可用，但依赖远端专有基础设施

下面这些不是 stub，也不是纯 ant-only，但它们的执行面依赖远端服务：

- `ultraplan`
- `ultrareview`
- `remote-env`
- `settings sync`
- `team memory sync`
- `mcp channels`

它们应归类为：

- `subscriber-remote`
- 或 `first-party-only`

### 源码完整，且已纳入默认 build

下面这些能力从代码主体看是完整的，而且现在已经补进默认 build：

- `DIRECT_CONNECT`
- `UDS_INBOX`
- `BRIDGE_MODE`

这类能力应归类为：

- `available-in-build`

### 不能靠开关直接解锁

下面这些当前不是 gate 问题，而是实现本身缺失或明确是 stub：

- `REPLTool`
- `TungstenTool`
- `useMoreRight`

这类应归类为：

- `stub/incomplete`

## 重点功能矩阵

| 功能 | 当前状态 | 面向人群 | 当前阻断点 | 结论 |
| --- | --- | --- | --- | --- |
| `assistant` | 代码完整，默认 build 已编入 | 订阅用户 / 1P 用户 | 依赖 `KAIROS` 和 runtime gate | `subscriber-available` |
| `brief` | 代码完整，默认 build 已编入 | 订阅用户 / 1P 用户 | 依赖 entitlement / runtime config | `subscriber-available` |
| `proactive` | 代码完整，状态机完整 | 订阅用户 / 1P 用户 | 依赖 `PROACTIVE` 或 `KAIROS` 路径 | `subscriber-available` |
| `voice` | 代码完整 | `Claude.ai` 订阅用户 | 需要 OAuth、麦克风、音频依赖 | `subscriber-available` |
| `chrome` | 代码完整 | `Claude.ai` 订阅用户 | 需要订阅、扩展、非 WSL 等环境条件 | `subscriber-available` |
| `ultraplan` | 代码完整 | 订阅用户 / 1P 用户 | 依赖远端环境、策略、远端 session API | `subscriber-remote` |
| `ultrareview` | 代码完整 | 订阅用户 / 1P 用户 | 依赖远端 code review 环境与配额接口 | `subscriber-remote` |
| `DIRECT_CONNECT` | 代码完整 | 本地用户 | 默认 build 已启用；仍需显式使用 server/open 路径 | `available-in-build` |
| `UDS_INBOX` | 代码完整 | 本地用户 | 默认 build 已启用；仍需通过 peers/pipes/send 等入口使用 | `available-in-build` |
| `BRIDGE_MODE` | 代码完整 | 订阅用户 / self-hosted 用户 | 默认 build 已启用；官方路径仍有 entitlement / OAuth 条件 | `available-in-build` |
| `REPLTool` | Tool 外壳存在 | ant-native 运行时 | 当前 `call()` 明确返回不可用 | `stub/incomplete` |
| `TungstenTool` | 空壳 stub | 无 | 缺真实实现 | `stub/incomplete` |
| `useMoreRight` | external stub | 无 | real hook 缺失 | `stub/incomplete` |

## 分类规则

### `ant-only`

满足以下任一条件即可归入：

- 命令或工具只在 `USER_TYPE==='ant'` 时注册
- 外部构建在 parse / runtime 阶段直接拒绝
- 源码注释或逻辑明确说明只为内部用户设计

典型对象：

- `INTERNAL_ONLY_COMMANDS`
- `/files`
- `/tag`
- `/version`
- `/bridge-kick`
- agent `remote` isolation
- ant-only bundled skills

### `subscriber-available`

满足以下条件：

- 不要求 `USER_TYPE==='ant'`
- 对 `Claude.ai` 订阅用户是正经产品面
- 不需要额外补一个缺失运行时才能工作

典型对象：

- `assistant`
- `brief`
- `proactive`
- `voice`
- `chrome`

### `subscriber-remote`

满足以下条件：

- 面向订阅用户或 first-party OAuth 用户
- 本地入口完整
- 但真正执行依赖远端环境、远端 session API、策略或配额系统

典型对象：

- `ultraplan`
- `ultrareview`
- `remote-env`

### `available-in-build`

满足以下条件：

- 源码主体完整
- 默认 build 已经编入
- 运行时可能仍有订阅、OAuth、配置或显式命令入口要求

典型对象：

- `DIRECT_CONNECT`
- `UDS_INBOX`
- `BRIDGE_MODE`

### `stub/incomplete`

满足以下条件：

- 当前仓库里的实现明确是 stub
- 或关键执行引擎缺失
- 去掉 gate 之后仍然不会真正工作

典型对象：

- `REPLTool`
- `TungstenTool`
- `useMoreRight`

## 重点功能说明

### `assistant`

`assistant` 当前应视为“已经基本可用”，而不是“待恢复”。

原因：

- 默认 build 包含 `KAIROS`
- 命令 gate 只检查 `feature('KAIROS')` 和 `tengu_kairos_assistant`
- 本地 GrowthBook 默认值里 `tengu_kairos_assistant` 为 `true`

结论：

- `assistant` 是 `subscriber-available`

### `brief`

`brief` 当前也应视为“已经基本可用”。

原因：

- 默认 build 包含 `KAIROS_BRIEF`
- 命令逻辑完整
- `BriefTool` 逻辑完整
- 本地 GrowthBook 默认值中：
  - `tengu_kairos_brief = true`
  - `tengu_kairos_brief_config.enable_slash_command = true`

结论：

- `brief` 是 `subscriber-available`

### `proactive`

`proactive` 也是当前基本可用，而不是未恢复。

原因：

- 命令逻辑完整
- `src/proactive/index.ts` 有完整状态机
- `SleepTool` 已经挂接 proactive 状态
- 即使 `PROACTIVE` build flag 没默认开，只要 `KAIROS` 路径存在，命令仍可用

结论：

- `proactive` 是 `subscriber-available`

### `ultraplan`

`ultraplan` 不是 stub，也不是 ant-only。

原因：

- 默认 build 已编入 `ULTRAPLAN`
- 命令真实存在
- prompt 里还能自动触发 `/ultraplan`

但它不是纯本地能力，因为它依赖：

- `teleportToRemote()`
- 远端 eligibility
- 远端环境
- 组织策略
- Claude Code on the web session

结论：

- `ultraplan` 是 `subscriber-remote`

### `REPLTool`

`REPLTool` 不应被归到“可解锁，只差开关”。

原因：

- `call()` 里直接写明当前 build 不可用
- 注释明确说 REPL execution engine 由 ant-native runtime 提供

结论：

- `REPLTool` 是 `stub/incomplete`

### `DIRECT_CONNECT`

`DIRECT_CONNECT` 的 server/open/headless/client 链路是完整的。

当前状态：

- dev 默认开启
- 默认 build 也已启用

结论：

- `DIRECT_CONNECT` 是 `available-in-build`
- 现在不再是 build 阻断项

### `UDS_INBOX`

`UDS_INBOX` 的命令、hooks、tools 都在。

当前状态：

- dev 默认开启
- 默认 build 也已启用

结论：

- `UDS_INBOX` 是 `available-in-build`

### `BRIDGE_MODE`

`BRIDGE_MODE` 的主流程不是 stub。

当前状态：

- 默认 build 已启用
- 官方路径需要订阅/OAuth/entitlement
- self-hosted 路径能绕过一部分官方 gate

结论：

- `BRIDGE_MODE` 是 `available-in-build`
- 如果目标是先验证能力，自托管路径比官方 bridge 更现实

## 真正的 ant-only 范围

下面这些仍然应当稳稳归入 `ant-only`：

- `INTERNAL_ONLY_COMMANDS`
- `/files`
- `/tag`
- `/version`
- `/bridge-kick`
- ant-only 工具注入：
  - `ConfigTool`
  - `TungstenTool`
  - `REPLTool`
  - `SuggestBackgroundPRTool`
- agent `remote` isolation
- ant-only bundled skills：
  - `verify`
  - `remember`
  - `stuck`
  - `skillify`

这些不是订阅用户能力。

## 对逆向恢复的优先级建议

### 第一优先级

- `REPLTool`
- `TungstenTool`
- `useMoreRight`

原因：

- 这三项才是真正的实现缺口
- build 侧阻断已经不再是当前最主要问题

### 第二优先级

- 梳理 `assistant / brief / proactive / DIRECT_CONNECT / UDS_INBOX / BRIDGE_MODE` 的实际交付面
- 确认哪些该进入默认发布、哪些仍保留实验属性

原因：

- 这些能力很多已经能跑
- 更需要的是收敛发布策略和文档口径

## 附录：关键代码证据

### 订阅用户判定

- `src/utils/auth.ts:100`
- `src/utils/auth.ts:1560`
- `src/utils/auth.ts:1576`
- `src/utils/auth.ts:1679`
- `src/utils/auth.ts:1690`

### `assistant / brief / proactive`

- `src/commands/assistant/gate.ts:11`
- `src/commands/brief.ts:44`
- `src/commands/proactive.ts:14`
- `src/proactive/index.ts:37`
- `packages/builtin-tools/src/tools/BriefTool/BriefTool.ts:126`
- `packages/builtin-tools/src/tools/SleepTool/SleepTool.ts:22`
- `src/services/analytics/growthbook.ts:455`
- `src/services/analytics/growthbook.ts:469`
- `build.ts:28`
- `build.ts:40`

### `ultraplan`

- `src/commands/ultraplan.tsx:377`
- `src/commands/ultraplan.tsx:396`
- `src/commands/ultraplan.tsx:536`
- `src/utils/processUserInput/processUserInput.ts:470`
- `src/utils/teleport.tsx:818`
- `src/utils/background/remote/preconditions.ts:45`
- `build.ts:30`

### `DIRECT_CONNECT`

- `src/main.tsx:4728`
- `src/main.tsx:4846`
- `src/server/createDirectConnectSession.ts:26`
- `src/server/connectHeadless.ts:21`
- `src/server/sessionManager.ts:21`
- `src/server/backends/dangerousBackend.ts:14`
- `scripts/dev.ts:58`

### `UDS_INBOX`

- `src/commands.ts:122`
- `src/hooks/usePipeIpc.ts:458`
- `src/tools.ts:145`
- `packages/builtin-tools/src/tools/SendMessageTool/SendMessageTool.ts:520`
- `scripts/dev.ts:46`
- `build.ts:39`

### `BRIDGE_MODE`

- `src/commands/bridge/index.ts:6`
- `src/bridge/bridgeMain.ts:2002`
- `src/bridge/bridgeEnabled.ts:29`
- `src/bridge/bridgeEnabled.ts:32`
- `src/bridge/bridgeEnabled.ts:57`
- `src/bridge/bridgeEnabled.ts:82`
- `scripts/dev.ts:27`

### `REPLTool`

- `packages/builtin-tools/src/tools/REPLTool/REPLTool.ts:78`
- `packages/builtin-tools/src/tools/REPLTool/REPLTool.ts:84`

### `stub / incomplete`

- `src/moreright/useMoreRight.tsx:1`
- `packages/builtin-tools/src/tools/TungstenTool/TungstenTool.ts:1`
- `packages/builtin-tools/src/tools/WebBrowserTool/WebBrowserPanel.ts:1`

### `ant-only`

- `src/commands.ts:267`
- `src/commands.ts:400`
- `src/commands/version.ts:17`
- `src/commands/files/index.ts:7`
- `src/commands/tag/index.ts:7`
- `src/commands/bridge-kick.ts:195`
- `src/tools.ts:235`
- `src/tools.ts:253`
- `packages/builtin-tools/src/tools/AgentTool/loadAgentsDir.ts:607`
- `packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx:669`
