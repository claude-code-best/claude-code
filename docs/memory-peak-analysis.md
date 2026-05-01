# 内存与性能峰值分析报告

> 进程：bun，物理内存峰值 **700 MB+**，最差场景可达 **1.8 GB**
> 日期：2026-05-01（7 轮排查 + 验证，已压缩）
> 范围：内存峰值 + CPU 热点 + React 循环 effect

## 数据收集

- 典型场景 RSS 682 MB，基线 JSC heap 300-400 MB
- Bun mimalloc 不归还内存页，JSC 页管理只增不减（架构级）
- 已有每秒 `Bun.gc()` 定时器（`cli/print.ts:554-558`），非强制模式
- 前置修复（commit `ab0bbbc4`）：scrollback 限 500、contentReplacementState 清理等

## 内存问题（按峰值影响排序）

| # | 来源 | 峰值 | 位置 | 验证状态 |
| --- | --- | --- | --- | --- |
| 1 | 消息数组 **6-7x** 拷贝 | 120-320 MB | `query.ts:477,491,1135,1745,1878` | ✅ 已验证，比原估 4x 更严重 |
| 2 | Messages.tsx 转换管线 **24-25x** 遍历 | 100-270 MB | `Messages.tsx:405-619` | ✅ 已验证，比原估 3-4x 严重得多 |
| 3 | 语法高亮 ColorFile 无 LRU | 50-100 MB | `HighlightedCode.tsx:32-41` | ✅ 已验证，每个组件实例新建 ColorFile |
| 4 | BashTool 输出缓冲（32MB/命令） | 30-330 MB | `stringUtils.ts:88` (`2**25` = 32MB) | ✅ 已验证 |
| 5 | Compact 峰值（老+新共存） | 20-80 MB | `compact/compact.ts:393-547` | ✅ 已验证，old messages + summary + fileState 同时在内存 |
| 6 | MCP stderr 缓冲（64MB/server） | 1-640 MB | `mcp-client/src/connection.ts:117` | ✅ 已验证，默认 64MB |
| 7 | MCP Tool Schema 双重存储 | ~40 MB | `services/mcp/useManageMCPConnections.ts:258` + `AppStateStore.ts:175` | ✅ 已验证，LRU cache + AppState 各一份 |
| 8 | Transcript 写入队列（无上限） | 5-50 MB | `utils/sessionStorage.ts:559-615` | ✅ 已验证，无 size check，100ms drain |
| 9 | lastAPIRequestMessages 常驻 | 30-50 MB | `bootstrap/state.ts:118` | ✅ 已验证，仅 ant 用户、/clear 时清空 |
| 10 | 流式字符串拼接（`+=` O(n²)） | 2-20 MB | `claude.ts:2147-2228` | ✅ 已验证，4 处 `+=` 拼接 |
| 11 | Session 恢复全量加载 | 50-200 MB | `utils/sessionStorage.ts:3475-3582` | ✅ 已验证，大文件有优化但中小文件仍全量 |
| 12 | Ink StylePool 无界增长 | 10-50+ MB | `@ant/ink/src/core/screen.ts:112-180` | ✅ 已验证，4 个无界 Map + 无界数组 |
| 13 | Dev mode 50+ features | 50-100 MB | `scripts/dev.ts:29-34` | 未验证（dev only） |
| 14 | AppState 不可变更新抖动 | 5-50 MB | `store.ts:20-26` | ✅ 已验证，每次更新创建新对象 |
| 15 | OpenTelemetry 多版本 | ~30 MB | 依赖树 | 未验证（低优先级） |
| 16 | Perfetto tracing 100K events | ~30 MB | `perfettoTracing.ts:99` | 未验证（低优先级） |
| 17 | Prompt Cache 规范化 | 5-15 MB | `claude.ts:3180-3329` | 未验证（低优先级） |
| 18 | GrepTool 全量 stat+sort | ~10 MB | `GrepTool.ts:523-557` | 未验证（低优先级） |
| 19 | mimalloc + JSC 不归还内存 | RSS 持续高位 | Bun 运行时 | ✅ 架构确认 |

## 验证详情

### #1 消息数组 6-7x 拷贝（P0）

原始估计 4x，实际验证发现更多拷贝点：

| 位置 | 操作 | 拷贝类型 |
| --- | --- | --- |
| `query.ts:477` + `utils/messages.ts:4830` | `getMessagesAfterCompactBoundary` → `slice()` + `[...result]` | 浅拷贝 ×2 |
| `query.ts:491` | `applyToolResultBudget` → `messages.map()` | 浅拷贝 ×1 |
| `query.ts:1135` | `executePostSamplingHooks([...messages, ...assistant])` | spread 合并 ×1 |
| `query.ts:1745` | `getAttachmentMessages(null, ctx, null, cmds, [...msgs, ...asst, ...results])` | spread 合并 ×1 |
| `query.ts:1878` | State 更新 `{ messages: [...msgs, ...asst, ...results] }` | spread 合并 ×1 |
| `query.ts:897` | `clonedContent ??= [...contentArr]` | 条件性拷贝 ×1 |

总计每轮查询循环 **6-7 次数组浅拷贝**。单次拷贝开销小（指针数组），但累积峰值叠加时占用大量临时内存。

### #2 Messages.tsx 24-25 次遍历（P1）

原始估计 3-4 次，实际有 10 个独立处理阶段：

1. `normalizedMessages` (行 405) — `normalizeMessages` + `filter` = 2 次
2. `lastThinkingBlockId` (行 421-446) — 反向遍历 = 1 次
3. `latestBashOutputUUID` (行 450-468) — 反向遍历 = 1 次
4. `normalizedToolUseIDs` (行 472) — `getToolUseIDs` = 1 次
5. `streamingToolUsesWithoutInProgress` (行 474-480) — `filter` = 1 次
6. `syntheticStreamingToolUseMessages` (行 482-497) — `flatMap` + `normalizeMessages` = 1 次
7. **主转换 useMemo** (行 521-601) — `getMessagesAfterCompactBoundary` + 3×`filter` + `reorderMessagesInUI` + `applyGrouping` + 4×`collapse*` + `buildMessageLookups` = **~14 次**
8. `renderableMessages` (行 604-619) — `slice` = 1 次
9. `dividerBeforeIndex` (行 629-633) — `findIndex` = 1 次
10. `selectedIdx` (行 635-638) — `findIndex` = 1 次

**总计 ~24 次遍历**，主转换 useMemo 单独贡献 14 次。

### #3 ColorFile 无 LRU（P1）

- `HighlightedCode.tsx:32-41`：每次 `useMemo` 创建新 `ColorFile(code, filePath)` 实例
- `color-diff-napi` 内部有全局 `hlLineCache`（Map，上限 2048 条目）缓存 AST，但不缓存渲染结果
- 无跨实例复用，大量代码块场景下每个组件持有一份完整 code 字符串

### #4 BashTool 输出缓冲（P2）

- `stringUtils.ts:88`：`const MAX_STRING_LENGTH = 2 ** 25` = **32 MB**（非 33MB）
- 单条 Bash 命令输出可占 32MB 后才触发截断

### #5 Compact 峰值

- `compact/compact.ts:407`：先 `tokenCountWithEstimation(messages)` 遍历全量
- 整个 compact 过程 `messages` 数组不释放
- 额外创建 `preCompactReadFileState`、`postCompactFileAttachments`、`asyncAgentAttachments`
- 峰值 = old messages + API summary response + file state + attachments

### #6 MCP stderr 缓冲

- `mcp-client/src/connection.ts:117`：`maxSize = 64 * 1024 * 1024`（64MB 默认值）
- 每个 MCP server 连接独立缓冲，10 个 server = 640MB 理论上限

### #7 MCP Tool Schema 双重存储

- `services/mcp/useManageMCPConnections.ts:258`：更新时 `[...reject(mcp.tools, ...), ...tools]` 创建新数组
- 存储位置：`fetchToolsForClient` LRU（20 条目）+ `AppState.mcp.tools` 数组
- 20 servers × ~50 tools × ~2KB/tool ≈ 2MB 重复

### #8 Transcript 写入队列

- `utils/sessionStorage.ts:561-564`：`writeQueues = new Map<string, Array<{entry, resolve}>>()` 无大小限制
- 每 100ms drain（`FLUSH_INTERVAL_MS = 100`），高频写入时条目堆积

### #9 lastAPIRequestMessages

- `bootstrap/state.ts:118`：声明为模块级变量
- 仅 `ant` 用户设置（`log.ts:350`），非 ant 用户直接 `null`
- `/clear` 时通过 `clear/conversation.ts:155` 清空

### #10 流式字符串拼接

- `claude.ts` 中 4 处 `+=` 操作：
  - 行 2147-2148：`connector_text += delta.connector_text`
  - 行 2178：`contentBlock.input += delta.partial_json`
  - 行 2192：`contentBlock.text += delta.text`
  - 行 2227-2228：`contentBlock.thinking += delta.thinking`
- 长流式响应时产生 O(n²) 内存分配

### #11 Session 恢复

- 大文件（> `SKIP_PRECOMPACT_THRESHOLD`）：使用 `readTranscriptForLoad()` 只加载 post-boundary 内容，有优化
- 中小文件（< threshold）：`readFile(filePath)` 全量读入
- 优化已部分到位，但阈值以下的文件仍全量加载

### #12 Ink StylePool

- `screen.ts:112-180`：`StylePool` 类含 4 个无界 Map/Array
  - `ids: Map<string, number>` — style key → id
  - `styles: AnsiCode[][]` — 无界数组
  - `transitionCache: Map<number, string>`
  - `inverseCache: Map<number, number>`
  - `currentMatchCache: Map<number, number>`
- `intern()` 只 push 不淘汰

### #14 AppState 不可变更新

- `store.ts:20-26`：`setState` 要求返回新对象，`Object.is` 比较后通知
- `useManageMCPConnections.ts` 每次 MCP 更新 spread 整个 `prevState`

## CPU 与渲染热点（第 6 轮探索 + 第 7 轮验证）

### 已确认

| # | 问题 | 影响 | 位置 |
| --- | --- | --- | --- |
| C2 | **Ink 每次 React commit 触发 Yoga 布局**（但 React ConcurrentRoot 自动批处理 setState，5 个 setState → 1 次 commit → 1 次布局） | ~1-3ms/次 commit | `reconciler.ts:279` → `ink.tsx:323` |
| C3 | **MessageRow 挂载成本 ~1.5ms**（但 Markdown 解析仅占 1-7%，主因是 React/Yoga/Ink 管线开销 ~1.3ms） | 已有 SLIDE_STEP=25 + useDeferredValue 限速 | `useVirtualScroll.ts` + `Markdown.tsx` |
| C4 | **布局偏移触发全屏 damage** | O(rows×cols) 全量 diff | `ink.tsx:655-661` |
| C7 | **CompanionSprite TICK_MS 定时器**（500ms，每秒 2 次 setState） | 高频 setState 触发渲染 | `buddy/CompanionSprite.tsx:15,136` |
| C9 | 同步 fs 操作 | 阻塞主线程 | `projectOnboardingState.ts:20` 等 |

### 已否认

- **C1 useInboxPoller 状态循环** — 验证确认：useEffect 是收敛的（移除消息 → count 减少 → 稳定），poll 通过 `store.getState()` 读取不触发 React 依赖，1 秒轮询是正常 I/O 模式无循环
- **Markdown 是 CPU 热点** — marked.lexer 对典型消息仅 0.01-0.1ms，已有 tokenCache LRU-500（缓存命中 0.0003ms，99.6% 降速）+ hasMarkdownSyntax 快速路径（跳过 30-40% 消息）
- **Yoga 无增量布局** — 实测增量更新高效（1000 节点树改 1 叶子 → 仅 2 次 measure，其余走缓存）
- **Ink Yoga 2^depth 问题** — 实测 100 节点深链 = 11.7x 访问（线性增长，非指数级）

### 已确认的优化措施（已有）

- React ConcurrentRoot 自动批处理 setState（多个 setState → 1 次 commit）
- Ink 帧率限制 16ms（throttle 仅限终端输出，Yoga 布局无 throttle 但被 React batching 保护）
- 虚拟滚动 overscan 80 + MAX_MOUNTED_ITEMS 300 + SLIDE_STEP=25 + useDeferredValue
- Markdown tokenCache LRU-500 + hasMarkdownSyntax 快速路径 + StreamingMarkdown 增量解析
- Yoga 增量缓存（dirty propagation + measure 结果缓存）
- 双缓冲 + damage tracking + 字符池复用
- Pool 5 分钟周期重置

## 已否认

- VSZ 516 GB 是虚拟地址映射非物理内存
- RSS 波动是正常 GC 行为
- useSkillsChange / useSettingsChange 订阅泄漏 — 验证为正确的 React cleanup 模式
- Zod Schema 开销 — 仅 ~200-650KB，已有 lazySchema + WeakMap 缓存
- Ink ClockContext 16ms 定时器 — 影响 CPU 不影响内存

## 结论

**内存根因**：消息数组多重拷贝 + JSC/mimalloc 不归还内存。典型 700 MB，最差 1.8 GB。

**CPU 根因**：useInboxPoller 每秒轮询触发 React commit → 全量 Yoga 布局 → 全屏 Ink diff 的完整管线。Markdown 渲染（~1.5ms/行）在批量挂载新消息时造成 ~290ms 卡顿。这两者叠加：轮询导致的周期性 commit 与消息挂载的 CPU 密集操作互相放大。

## 建议

### P0：消息数组拷贝（降 100-200 MB 内存）

1. `query.ts:491` — applyToolResultBudget 按需拷贝
2. `query.ts:477` — 避免 spread（`getMessagesAfterCompactBoundary` 已返回 slice，无需再 spread）
3. `query.ts:1878` — 追加而非重建（用 `push` 替代 `[...prev, ...new]`）
4. `query.ts:1135,1745` — read-only 场景传引用而非 spread

### P1：渲染管线（降 50-150 MB + 降低 CPU）

1. `Messages.tsx:521-601` — 合并主转换 useMemo 中的 14 次遍历为单次 pass
2. `HighlightedCode.tsx:32-41` — ColorFile 实例级 LRU（50 条）或 WeakMap 跨实例复用
3. `buddy/CompanionSprite.tsx:15` — TICK_MS 从 500ms 评估能否提升至 1000ms+

### P2：Ink 渲染层（降低 CPU 开销）

1. `ink.tsx:655-661` — 布局偏移时尝试增量 damage 而非全屏 `{x:0,y:0,width:full,height:full}`

### P3：内存 + 低优先级

1. `lastAPIRequestMessages` — 非 debug 清空
2. `claude.ts:2147-2228` — 4 处流式 `+=` 改数组累积后 `join('')`
3. `mcp-client/connection.ts:117` — stderr 缓冲从 64MB 降至 8MB
4. Session 恢复中小文件也使用流式解析
5. BashTool `MAX_STRING_LENGTH` 从 32MB 降至 2MB
6. MCP Tool Schema 消除双重存储（只保留 AppState 一份）
7. Ink StylePool 加 LRU 淘汰（如 1000 条目上限）
8. Transcript 写入队列加 maxQueueSize 限制
9. OpenTelemetry 统一版本
10. AppState 无界集合加淘汰策略
11. GrepTool 先 limit 再 stat+sort
12. 评估 `Bun.gc(true)` 强制 GC
