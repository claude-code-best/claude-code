# `/summary` 完整实现设计（基于现有代码反推）

> 更新日期: 2026-04-15
> 设计目标: 基于当前仓库已有能力，设计一个**完整可交付**的 `/summary` 命令，而不是只补最小可用版本。
> 结论口径: 以当前源码为准，优先复用现有 `SessionMemory`、session transcript、resume/session listing 相关能力，不另起一套平行系统。

## 一、设计结论

`/summary` 的完整实现，应该分成两条能力线：

1. **当前会话摘要**
   - 显式触发一次最新摘要生成
   - 读取并展示当前 session memory 的 `summary.md`

2. **历史会话摘要查看**
   - 查看最近会话的摘要
   - 按 session id 查看指定会话的摘要
   - 按标题关键词查找会话摘要

这两条能力线应复用两套已有系统：

- **当前会话**：`SessionMemory`
- **历史会话**：`sessionStorage.ts` / `listSessionsImpl.ts`

不应该做的是：

- 新造一个“即时摘要模型调用”系统
- 用另一套 prompt 平行生成 summary
- 把 `/summary` 做成和现有 session memory 脱钩的独立功能

## 二、现有代码里已经具备的基础

### 2.1 命令入口已注册，但当前仍是 stub

文件：

- `src/commands/summary/index.js`
- `src/commands.ts`

现状：

- `src/commands.ts` 已静态导入 `summary`
- `src/commands/summary/index.js` 仍为隐藏 stub

这说明：

- `/summary` 已经是一个明确存在的产品面
- 不是“新功能提案”，而是“已注册但未实现的命令”

### 2.2 当前会话摘要：已有专门的手动触发入口

文件：

- `src/services/SessionMemory/sessionMemory.ts`

现状：

源码注释已经明确说明：

```ts
/**
 * Manually trigger session memory extraction, bypassing threshold checks.
 * Used by the /summary command.
 */
export async function manuallyExtractSessionMemory(...)
```

这意味着 `/summary` 当前会话模式的核心调用入口已经被设计好了。

### 2.3 当前会话摘要内容：已有统一读取口

文件：

- `src/services/SessionMemory/sessionMemoryUtils.ts`
- `src/utils/permissions/filesystem.ts`

现状：

- `getSessionMemoryPath()` 返回当前 session memory 文件路径
- `getSessionMemoryContent()` 返回当前 `summary.md` 内容

因此 `/summary` 不需要再自己拼装“当前会话摘要文本”，而应直接展示该文件内容。

### 2.4 历史会话摘要：已有 transcript 元数据能力

文件：

- `src/utils/sessionStorage.ts`
- `src/utils/listSessionsImpl.ts`

已有能力：

- `getLastSessionLog(sessionId)`：读取单个 session 的 transcript 汇总视图
- `searchSessionsByCustomTitle(query)`：按自定义标题搜索 session
- `listSessionsImpl(options)`：列出 session 摘要元数据
- `getSessionFilesLite(projectDir, limit)`：快速拿 lite logs

这意味着：

- `/summary session <id>` 不需要重新扫完整 transcript 逻辑
- `/summary find <query>` 不需要重新造搜索层
- `/summary recent` 可以直接复用 session listing

### 2.5 现有命令体系支持“一级命令 + 二级动作”

文件：

- `src/types/command.ts`
- `src/utils/processUserInput/processSlashCommand.tsx`
- `src/commands/mcp/mcp.tsx`
- `src/commands/job/job.tsx`
- `src/commands/daemon/daemon.tsx`

当前 slash command 体系本来就是：

1. `processSlashCommand()` 解析 `/command [args]`
2. 再把 `args` 原样传给命令实现
3. 命令自己解析二级动作

因此 `/summary` 最合理的实现方式也是：

- 一级命令：`/summary`
- 二级动作：由 `args` 解析

而不是额外拆成：

- `/summary-last`
- `/summary-find`
- `/summary-session`

这种平铺命名。

## 三、命令形态：一级命令 + 二级动作

建议统一语法：

```bash
/summary <subcommand> [args]
```

无参数时：

```bash
/summary
```

等价于：

```bash
/summary refresh
```

也就是：

- 对当前会话显式触发一次 session memory 提取
- 然后展示摘要结果

### 3.1 当前会话动作

```bash
/summary
/summary refresh
/summary raw
/summary path
```

语义：

- `/summary`
  刷新当前会话摘要并以友好格式展示
- `/summary refresh`
  与 `/summary` 等价，但语义更显式
- `/summary raw`
  刷新后输出完整 `summary.md`
- `/summary path`
  输出当前摘要文件路径

### 3.2 历史会话动作

```bash
/summary last
/summary recent
/summary recent <n>
/summary session <session-id>
/summary find <query>
```

语义：

- `/summary last`
  查看最近一个会话的摘要
- `/summary recent`
  列出最近若干会话摘要
- `/summary recent <n>`
  列出最近 `n` 个会话摘要
- `/summary session <session-id>`
  查看指定 session 的摘要
- `/summary find <query>`
  按标题关键词搜索并展示匹配会话摘要

### 3.3 为什么 `find <query>` 第一版只查 title

因为当前已有现成能力就是：

- `searchSessionsByCustomTitle(query)`

如果第一版就强行做：

- title + firstPrompt + summary 全字段模糊搜索

那就会把简单实现拖进一个新的 session search 设计里。

完整实现不等于“一口气做最大范围”；完整实现应该先建立稳定语义，再逐步扩展搜索范围。

## 四、每种模式对应的数据源

| 模式 | 数据源 | 说明 |
|------|------|------|
| `summary` / `refresh` / `raw` / `path` | `SessionMemory` | 当前会话，显式触发提取后读取 `summary.md` |
| `last` | `listSessionsImpl` + `getLastSessionLog` | 先找最近 session，再读详细摘要 |
| `session <id>` | `getLastSessionLog` | 直接读取指定 session |
| `recent [n]` | `listSessionsImpl` | 展示摘要列表，不需要全量 transcript |
| `find <query>` | `searchSessionsByCustomTitle` | 第一版先按 customTitle 查找 |

## 五、命令模块设计

建议实现文件：

- `src/commands/summary/index.ts`

导出形态：

```ts
const summary = {
  type: 'local',
  name: 'summary',
  description: 'Generate or view session summaries',
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
} satisfies Command
```

### 5.1 为什么是 `local`

因为当前实现需要：

- 参数路由
- 条件分支
- 调用已有函数
- 错误处理
- 文件读取

这不是“给模型一段说明让它去决定”的场景，而是“命令协调器”的场景。

### 5.2 为什么不拆成多条平铺命令

因为当前仓库已有约定是：

- 一个命令负责一个命名空间
- 子动作由 `args` 解析

所以 `/summary` 的实现应更接近：

- `/mcp ...`
- `/job ...`
- `/daemon ...`

而不是单独拆出多条并列命令。

## 六、内部实现结构建议

建议拆成 4 组 helper，而不是把所有逻辑塞进 `call()`：

### 6.1 参数解析

建议函数：

```ts
function parseSummaryArgs(args: string): SummaryCommandInput
```

返回一个判别联合：

```ts
type SummaryCommandInput =
  | { mode: 'current'; raw: boolean }
  | { mode: 'path' }
  | { mode: 'last' }
  | { mode: 'session'; sessionId: UUID }
  | { mode: 'recent'; limit: number }
  | { mode: 'find'; query: string }
```

建议实际解析规则：

```ts
''         -> { mode: 'current', raw: false }
'refresh'  -> { mode: 'current', raw: false }
'raw'      -> { mode: 'current', raw: true }
'path'     -> { mode: 'path' }
'last'     -> { mode: 'last' }
'recent'   -> { mode: 'recent', limit: DEFAULT_RECENT_LIMIT }
'recent 5' -> { mode: 'recent', limit: 5 }
'session <id>' -> { mode: 'session', sessionId }
'find foo bar' -> { mode: 'find', query: 'foo bar' }
```

### 6.2 当前会话摘要执行

建议函数：

```ts
async function runCurrentSessionSummary(
  messages: Message[],
  toolUseContext: ToolUseContext,
  opts: { raw?: boolean }
): Promise<LocalCommandResult>
```

职责：

1. 校验是否有消息
2. 调用 `manuallyExtractSessionMemory()`
3. 调用 `getSessionMemoryContent()`
4. 组装文本结果

### 6.3 历史会话摘要读取

建议函数：

```ts
async function runHistoricalSummary(
  input: HistoricalSummaryInput
): Promise<LocalCommandResult>
```

支持：

- `last`
- `session`
- `recent`
- `find`

### 6.4 格式化输出

建议统一 formatter：

```ts
function formatCurrentSummary(...)
function formatSessionSummary(...)
function formatRecentSessionList(...)
```

避免命令逻辑和显示逻辑缠在一起。

## 七、当前会话模式的完整调用链

```text
/summary
  -> processSlashCommand()
  -> commands.ts 中 summary
  -> summary/index.ts local call()
  -> parseSummaryArgs()
  -> runCurrentSessionSummary()
  -> manuallyExtractSessionMemory(messages, toolUseContext)
  -> SessionMemory 子代理更新 summary.md
  -> getSessionMemoryContent()
  -> formatCurrentSummary()
  -> 返回 LocalCommandResult { type: 'text' }
```

## 八、历史会话模式的完整调用链

### 8.1 `/summary last`

```text
/summary last
  -> listSessionsImpl({ dir: getOriginalCwd(), includeWorktrees: true, limit: 2+ })
  -> 取最近一条非当前 session
  -> getLastSessionLog(sessionId)
  -> formatSessionSummary()
```

### 8.2 `/summary session <id>`

```text
/summary session <id>
  -> getLastSessionLog(sessionId)
  -> formatSessionSummary()
```

### 8.3 `/summary recent [n]`

```text
/summary recent 5
  -> listSessionsImpl({ dir: getOriginalCwd(), includeWorktrees: true, limit: 5 })
  -> formatRecentSessionList()
```

### 8.4 `/summary find <query>`

```text
/summary find auth
  -> searchSessionsByCustomTitle('auth')
  -> formatSessionSummary() or formatRecentSessionList()
```

## 九、输出格式设计

### 9.1 当前会话默认输出

建议：

```text
Session summary updated.

<summary.md 内容>
```

### 9.2 当前会话 path 模式

```text
Session summary path:
<absolute-path>
```

### 9.3 历史会话摘要输出

建议包含：

- session id
- custom title / summary / firstPrompt 的优先展示
- modified 时间
- tag / gitBranch / projectPath（若存在）

例如：

```text
Session: <id>
Title: Fix auth redirect loop
Updated: 2026-04-15 14:20
Branch: fix/auth-redirect
Tag: auth

Summary:
<summary text>
```

### 9.4 recent 模式输出

建议压缩成列表：

```text
Recent sessions:

1. <id>  Fix auth redirect loop
   Updated: 2026-04-15 14:20

2. <id>  Add session memory tests
   Updated: 2026-04-15 10:03
```

## 十、错误模型

至少覆盖以下情况：

### 10.1 当前会话

- 没有消息可总结
- 手动提取失败
- 提取成功但读取失败
- 文件为空

### 10.2 历史会话

- session id 不合法
- session 不存在
- session 存在但没有可提取摘要
- `find` 无匹配结果

建议文案：

- `No messages to summarize.`
- `Failed to generate session summary: <error>`
- `Session summary was updated, but could not be read back.`
- `Session summary is empty.`
- `Session not found: <id>`
- `No matching sessions found for "<query>".`

## 十一、和现有能力的边界

### 11.1 不替代 `task summary`

`task summary` 仍然只负责：

- 后台会话中途状态
- `claude ps` 风格展示

`/summary` 不要去读或改 `saveTaskSummary()` 这条链。

### 11.2 不替代 `away summary`

`away summary` 仍然是：

- 极短 recap
- 离开/回来场景

`/summary` 应该输出更完整内容。

### 11.3 不新造第二套 session summary 存储

当前会话继续使用：

- `summary.md`

历史会话继续使用：

- transcript 中已有 `summary/customTitle/firstPrompt`

## 十二、测试设计

建议新建：

- `src/commands/__tests__/summary.test.ts`

至少覆盖：

### 12.1 当前会话

1. `/summary` 成功路径
2. `/summary raw`
3. `/summary path`
4. `manuallyExtractSessionMemory()` 失败
5. `getSessionMemoryContent()` 返回空

### 12.2 历史会话

6. `/summary session <id>` 成功
7. `/summary session <id>` 找不到 session
8. `/summary last`
9. `/summary recent`
10. `/summary find <query>` 有结果
11. `/summary find <query>` 无结果

### 12.3 参数解析

12. 无参数
13. 非法参数
14. 缺少 `session <id>` 的 id
15. `recent` 的 limit 非法

## 十三、分阶段落地

### Phase 1：当前会话

- `/summary`
- `/summary refresh`
- `/summary raw`
- `/summary path`

### Phase 2：历史会话

- `/summary last`
- `/summary session <id>`
- `/summary recent [n]`

### Phase 3：搜索

- `/summary find <query>`
- 搜索范围增强（如标题之外的字段）

## 十四、验收标准

完整实现完成时，应满足：

1. `/summary` 不再是隐藏 stub
2. 当前会话摘要链路完整可用
3. 历史会话摘要查看链路完整可用
4. 参数语义稳定
5. 错误分支有清晰输出
6. 测试覆盖当前会话 + 历史会话主路径

## 十五、后续扩展

在完整实现落地后，再考虑：

1. section 过滤
2. richer search
3. 指定输出格式（markdown/plain/json）
4. 与 `/resume` 和 session picker 的更强联动

但这些不应阻塞本次实现。
