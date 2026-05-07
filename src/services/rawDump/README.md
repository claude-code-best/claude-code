# Raw Dump 数据上报模块

## 概述

本模块负责将 csc 的会话数据（Conversation、Summary、Commits）上报到 CoStrict 服务端，用于统计分析。

**设计原则：**
- **与框架解耦**：不依赖 React、Effect-TS、Ink 等任何 UI 框架
- **非阻塞**：使用 detached 子进程执行上报，主进程立即返回
- **协议兼容**：与 opencode 的 raw-dump 插件保持接口对齐

---

## 文件结构

```
src/services/rawDump/
├── README.md       # 本文档
├── types.ts        # 类型定义 + 环境变量常量
├── state.ts        # 磁盘状态管理（去重）
├── git.ts          # Git 辅助函数封装
├── worker.ts       # 独立 worker 进程（实际上报逻辑）
├── spawn.ts        # 子进程启动器
└── index.ts        # 主入口 API
```

---

## 上报流程

```
主进程：assistant message 完成
  → reportTurn(sessionID, messageID, directory)
    → 内存去重（Set）
    → spawn detached worker 进程
      → worker 加载会话消息（JSONL）
      → auth()：加载凭证、刷新 token
      → uploadConversation()  → POST /raw-store/task-conversation
      → uploadSummary()       → POST /raw-store/task-summary
      → uploadCommits()       → POST /raw-store/commit
      → writeState()          → 更新去重状态
```

---

## 触发时机

每完成一轮 assistant 回复，在上报点调用：

```typescript
import { reportTurn } from './services/rawDump/index.js'

// 参数说明：
// sessionID  - 当前会话 ID
// messageID  - 刚完成的 assistant message UUID
// directory  - 工作目录（用于 git diff 和 repo 信息）
reportTurn(sessionId, assistantMessage.uuid, cwd)
```

**推荐集成点：**

1. `src/query.ts` 中 streaming 结束后（`query_api_streaming_end` 之后）
2. `src/costrict/provider/index.ts` 中 `message_stop` 事件后
3. `src/utils/sessionDataUploader.ts` 已提供 `uploadSessionTurn()` 封装

---

## 数据映射（csc → 上报格式）

### Conversation（单轮对话）

| 字段 | 来源 | 说明 |
|-----|------|------|
| `task_id` | `sessionID` | 会话唯一标识 |
| `request_id` | `message.id` 或 `message.uuid` | assistant message ID |
| `model` | `assistant.message.model` | 使用的模型 |
| `mode` | `assistant.mode` / `assistant.agent` | 默认 "code" |
| `start_time` | parent user message `timestamp` | 用户请求时间 |
| `end_time` | assistant message `timestamp` | assistant 完成时间 |
| `upstream_tokens` | `usage.input + cache_read + cache_creation` | 输入 token 总量 |
| `downstream_tokens` | `usage.output` | 输出 token 量 |
| `request_content` | user message text content | 用户请求文本 |
| `response_content` | assistant text content | assistant 回复文本 |
| `diff` | tool_use diff → fallback `git diff HEAD` | 本轮代码变更 |
| `error_code` | error name 映射 | 401/413/499/500 |

### Summary（会话汇总）

| 字段 | 来源 | 说明 |
|-----|------|------|
| `task_id` | `sessionID` | 会话唯一标识 |
| `start_time` | 第一条消息 `timestamp` | 会话开始时间 |
| `end_time` | 最后一条消息 `timestamp` | 会话最后更新时间 |
| `upstream_tokens` | 所有 assistant messages 累计 | 会话总输入 token |
| `downstream_tokens` | 所有 assistant messages 累计 | 会话总输出 token |
| `user_id` | refresh_token JWT `universal_id` | 用户唯一标识 |
| `repo_addr` | `git remote get-url origin` | 仓库地址 |
| `repo_branch` | `git branch --show-current` | 当前分支 |
| `diff` | `git diff HEAD` | 工作区完整变更 |

### Commits（Git 提交）

| 字段 | 来源 | 说明 |
|-----|------|------|
| `commit_id` | `git log` | commit hash |
| `commit_time` | `git log %aI` | 作者时间（ISO） |
| `diff` | `git show --diff-filter=ACDMR` | 变更内容 |
| `comment` | `subject.slice(0, 150)` | 截断后的提交信息 |

---

## Diff 获取策略

csc 没有 opencode 中的 `step-start`/`step-finish` snapshot 机制，采用以下策略：

### Conversation diff
1. **优先**：从 assistant message 的 `tool_use` blocks 中提取 `input.content` / `new_string` / `diff` / `patch`
2. **Fallback**：执行 `git diff HEAD` 获取当前工作区未提交的变更

### Summary diff
- 直接执行 `git diff HEAD`，获取整个工作区相对于最新 commit 的变更

### Commits diff
- 逐个 commit 执行 `git show --diff-filter=ACDMR`（仅包含新增/修改/删除/重命名）

---

## 去重机制

### 1. 内存去重（进程内）
```typescript
const spawned = new Set<string>()
const key = `${sessionID}:${messageID}`
if (spawned.has(key)) return
```
限制 1024 条，超过后清理一半。

### 2. Conversation 去重（磁盘）
```typescript
// ~/.claude/csc-raw-dump-state.json
{
  "conversation": {
    "taskID:requestID": true
  }
}
```

### 3. Commits 去重（磁盘）
```typescript
// 以 repo#branch#workDir 为 key
{
  "commits": {
    "git@github.com:foo/bar.git#main#/Users/xxx/project": "abc123"
  }
}
```
- 有 lastCommit：取 `lastCommit..HEAD`
- 无 lastCommit：取 30 天内 commits

---

## 认证与请求头

复用已有的 `costrict/provider` 模块：

```typescript
import { loadCoStrictCredentials } from '../../costrict/provider/credentials.js'
import { refreshCoStrictToken } from '../../costrict/provider/token.js'
```

**请求头：**
- `Authorization: Bearer ${access_token}`
- `zgsm-client-id: ${machine_id}`
- `zgsm-client-ide: cli`
- `X-Costrict-Version: csc-${version}`

**Token 刷新：** 若 access_token 过期且存在 refresh_token，worker 会自动刷新并回写凭证文件。

---

## 环境变量

| 变量 | 说明 | 默认值 |
|-----|------|--------|
| `CSC_DISABLE_RAW_DUMP` | 禁用本模块 | `false` |
| `COSTRICT_DISABLE_RAW_DUMP` | 兼容 opencode 的禁用开关 | `false` |
| `CSC_RAW_DUMP_BASE_URL` | 自定义上报 base URL | 从凭证读取 |
| `COSTRICT_RAW_DUMP_BASE_URL` | 兼容 opencode 的自定义 URL | 从凭证读取 |
| `COSTRICT_BASE_URL` | CoStrict 服务地址 | `https://zgsm.sangfor.com` |

---

## 状态文件

```
~/.claude/csc-raw-dump-state.json
```

内容格式：
```json
{
  "conversation": {
    "session-id-1:msg-uuid-1": true,
    "session-id-1:msg-uuid-2": true
  },
  "commits": {
    "git@github.com:org/repo.git#main#/Users/xxx/code/repo": "abc123def"
  }
}
```

---

## 注意事项与待完善项

1. **Cost 计算**  
   当前 `cost` 字段设为 0。需接入 `src/cost-tracker.ts` 的 `calculateUSDCost()` 或从 `bootstrap/state.ts` 获取每轮/累计 cost。

2. **TTFT 获取**  
   当前从 assistant message 的 `ttftMs` 字段读取。需确认 csc 是否在 message 对象上保存了该值，否则需要在 streaming 开始时手动计时。

3. **会话目录**  
   `getSessionDirectory()` 使用启发式查找（`directory/.claude/sessions`、`directory/.claude`、directory 本身）。需根据 csc 实际会话 JSONL 存放路径校准。

4. **User 消息关联**  
   当前按消息列表顺序查找前一个 `type === 'user'` 的消息。若 csc 存在明确的 parent-child 关系，应改用 `parentID` 或类似字段。

5. **Model 信息**  
   `model` 字段取自 `assistant.message.model`。若该字段不可靠，可从 `bootstrap/state.ts` 的 `getCurrentModel()` 获取。

6. **Sender 识别**  
   当前固定为 `"user"`。若 csc 支持 agent/agentic 模式，需根据消息来源判断 `"user"` 或 `"agent"`。

---

## 与 opencode 的差异对比

| 项 | opencode | csc（本模块） |
|---|---------|-------------|
| 消息结构 | `parts` + `step-start/step-finish` snapshot | `message.content` (`ContentBlock[]`) |
| Diff 来源 | snapshot git diff | `git diff HEAD` / tool_use blocks |
| 会话加载 | 内存 Session 对象 | JSONL 文件解析 |
| Cost 来源 | `assistant.info.cost` | 待接入 cost-tracker |
| 运行时 | Effect-TS | Bun + 纯 Node.js API |
| Worker 启动 | `bun run index.ts raw-dump _worker` | `bun run worker.ts` |
| 凭证路径 | `~/.costrict/credentials.json` | `~/.claude/csc-auth.json` |

---

## 调试

Worker 进程的错误和日志通过 `console.error` 输出到 stderr，可在启动时重定向：

```bash
# 查看 worker 日志
CSC_RAW_DUMP_DEBUG=1 csc
```

或查看系统日志（worker 为 detached 进程，日志不输出到主进程终端）。
