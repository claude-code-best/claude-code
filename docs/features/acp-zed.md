# ACP (Agent Client Protocol) — Zed / IDE 集成

> Feature Flag: `FEATURE_ACP=1`（build 和 dev 模式默认启用）
> 实现状态：可用（支持 Zed、Cursor 等 ACP 客户端）
> 源码目录：`src/services/acp/`

## 一、功能概述

ACP (Agent Client Protocol) 是一种标准化的 stdio 协议，允许 IDE 和编辑器通过 stdin/stdout 的 NDJSON 流驱动 AI Agent。CCB 实现了完整的 ACP agent 端，可以被 Zed、Cursor 等支持 ACP 的客户端直接调用。

### 核心特性

- **会话管理**：新建 / 恢复 / 加载 / 分叉 / 关闭会话
- **历史回放**：恢复会话时自动加载并回放对话历史
- **权限桥接**：ACP 客户端的权限决策映射到 CCB 的工具权限系统
- **斜杠命令 & Skills**：加载真实命令列表，支持 `/commit`、`/review` 等 prompt 型 skill
- **Context Window 跟踪**：精确的 usage_update，含 model prefix matching
- **Prompt 排队**：支持连续发送多条 prompt，自动排队处理
- **模式切换**：auto / default / acceptEdits / plan / dontAsk / bypassPermissions
- **模型切换**：运行时切换 AI 模型

## 二、架构

```
┌──────────────┐    NDJSON/stdio    ┌──────────────────┐
│  Zed / IDE   │ ◄────────────────► │  CCB ACP Agent   │
│  (Client)    │   stdin / stdout   │  (Agent)         │
└──────────────┘                    │                  │
                                    │  entry.ts        │ ← stdio → NDJSON stream
                                    │  agent.ts        │ ← ACP protocol handler
                                    │  bridge.ts       │ ← SDKMessage → ACP SessionUpdate
                                    │  permissions.ts  │ ← 权限桥接
                                    │  utils.ts        │ ← 通用工具
                                    │                  │
                                    │  QueryEngine     │ ← 内部查询引擎
                                    └──────────────────┘
```

### 文件职责

| 文件 | 职责 |
|------|------|
| `entry.ts` | 入口，创建 stdio → NDJSON stream，启动 `AgentSideConnection` |
| `agent.ts` | 实现 ACP `Agent` 接口：会话 CRUD、prompt、cancel、模式/模型切换 |
| `bridge.ts` | `SDKMessage` → ACP `SessionUpdate` 转换：文本/思考/工具/用量/编辑 diff |
| `permissions.ts` | ACP `requestPermission()` → CCB `CanUseToolFn` 桥接 |
| `utils.ts` | Pushable、流转换、权限模式解析、session fingerprint、路径显示 |

## 三、配置 Zed 编辑器

### 3.1 Zed settings.json 配置

打开 Zed 的 `settings.json`（`Cmd+,` → Open Settings），添加 `agent_servers` 配置：

```json
{
  "agent_servers": {
    "ccb": {
      "type": "custom",
      "command": "ccb",
      "args": ["--acp"]
    }
  }
}
```

### 3.3 API 认证配置

CCB 的 ACP agent 在启动时会自动加载 `settings.json` 中的环境变量（`ANTHROPIC_BASE_URL`、`ANTHROPIC_AUTH_TOKEN` 等）。确保已通过 `/login` 配置好 API 供应商。

也可通过环境变量传入：

```json
{
  "agent_servers": {
    "claude-code": {
      "command": "ccb",
      "args": ["--acp"],
      "env": {
        "ANTHROPIC_BASE_URL": "https://api.example.com/v1",
        "ANTHROPIC_AUTH_TOKEN": "sk-xxx"
      }
    }
  }
}
```

### 3.4 在 Zed 中使用

1. 配置完成后重启 Zed
2. 打开任意项目目录
3. 按 `Cmd+'`（macOS）或 `Ctrl+'`（Linux）打开 Agent Panel
4. 在 Agent Panel 顶部的下拉菜单中选择 **claude-code**
5. 开始对话

### 3.5 功能说明

| 功能 | 操作 |
|------|------|
| 对话 | 在 Agent Panel 中直接输入消息 |
| 斜杠命令 | 输入 `/` 查看可用 skills 列表（如 `/commit`、`/review`） |
| 工具权限 | 弹出权限请求时选择 Allow / Reject / Always Allow |
| 模式切换 | 通过 Agent Panel 的设置菜单切换 auto/default/plan 等模式 |
| 模型切换 | 通过 Agent Panel 的设置菜单切换 AI 模型 |
| 会话恢复 | 关闭重开 Zed 后，之前的会话可自动恢复（含历史消息） |

## 四、配置其他 ACP 客户端

ACP 是开放协议，任何支持 ACP 的客户端都可以连接 CCB。通用配置模式：

```
命令: ccb --acp
参数: ["--acp"]
通信: stdin/stdout NDJSON
协议版本: ACP v1
```

### 4.1 Cursor

在 Cursor 的设置中配置 MCP / Agent Server，使用同样的 `ccb --acp` 命令。

### 4.2 自定义客户端

使用 `@agentclientprotocol/sdk` 可以快速构建 ACP 客户端：

```typescript
import { ClientSideConnection, ndJsonStream } from '@agentclientprotocol/sdk'

// 创建连接（将 ccb --acp 作为子进程启动）
const child = spawn('ccb', ['--acp'])
const stream = ndJsonStream(
  Writable.toWeb(child.stdin),
  Readable.toWeb(child.stdout),
)

const client = new ClientSideConnection(stream)

// 初始化
await client.initialize({ clientCapabilities: {} })

// 创建会话
const { sessionId } = await client.newSession({
  cwd: '/path/to/project',
})

// 发送 prompt
const response = await client.prompt({
  sessionId,
  prompt: [{ type: 'text', text: 'Hello, explain this project' }],
})

// 监听 session 更新
client.on('sessionUpdate', (update) => {
  console.log('Update:', update)
})
```

## 五、ACP 协议支持矩阵

| 方法 | 状态 | 说明 |
|------|------|------|
| `initialize` | ✅ | 返回 agent 信息和能力 |
| `authenticate` | ✅ | 无需认证（自托管） |
| `newSession` | ✅ | 创建新会话 |
| `resumeSession` | ✅ | 恢复已有会话（含历史回放） |
| `loadSession` | ✅ | 加载指定会话（含历史回放） |
| `listSessions` | ✅ | 列出可用会话 |
| `forkSession` | ✅ | 分叉会话 |
| `closeSession` | ✅ | 关闭会话 |
| `prompt` | ✅ | 发送消息，支持排队 |
| `cancel` | ✅ | 取消当前/排队的 prompt |
| `setSessionMode` | ✅ | 切换权限模式 |
| `setSessionModel` | ✅ | 切换 AI 模型 |
| `setSessionConfigOption` | ✅ | 动态修改配置 |

### SessionUpdate 类型

| 类型 | 状态 | 说明 |
|------|------|------|
| `agent_message_chunk` | ✅ | 助手文本消息 |
| `agent_thought_chunk` | ✅ | 思考/推理内容 |
| `user_message_chunk` | ✅ | 用户消息（历史回放） |
| `tool_call` | ✅ | 工具调用开始 |
| `tool_call_update` | ✅ | 工具调用结果/状态更新 |
| `usage_update` | ✅ | token 用量 + context window |
| `plan` | ✅ | TodoWrite → plan entries |
| `available_commands_update` | ✅ | 斜杠命令 & skills 列表 |
| `current_mode_update` | ✅ | 模式切换通知 |
| `config_option_update` | ✅ | 配置更新通知 |
