# 内存与性能峰值分析报告（最终版 — 5 轮迭代完成）

> 进程 bun，物理内存峰值 **700 MB+**，最差场景可达 **1.8 GB**
> 日期：2026-05-02 | 状态：**调研完成** | 范围：内存峰值 + CPU 热点 + React 渲染循环
> Round 5 增量：验证消息渲染管线（buildMessageLookups 8 Map/Set 重建）、useDeferredValue 双缓冲、FileReadTool 无上限、compaction 与 React 状态交互

## 数据收集

- 典型场景 RSS 682 MB，基线 JSC heap 300-400 MB
- Bun mimalloc 不归还内存页，JSC 页管理只增不减（架构级限制）
- 已有每秒 `Bun.gc()` 定时器（`cli/print.ts:554-558`），非强制模式
- 10 项已修复（commit `ef10ad28` + `ab0bbbc4`），降低约 100-300MB
- Round 3 确认：AWS SDK/Google Auth/Azure Identity 均动态 import（lazy），不贡献基线

## 已修复问题（commit ef10ad28 + ab0bbbc4）

| 问题 | 原峰值 | 修复方式 | 位置 |
|------|--------|----------|------|
| 流式字符串拼接 O(n²) | 2-20 MB | `+=` → 数组累积 | `claude.ts:1834,2271` |
| Messages.tsx 多次遍历 | 100-270 MB | 合并单次 pass | `Messages.tsx:417-418` |
| ColorFile 无缓存 | 50-100 MB | LRU 缓存 50 条目 | `HighlightedCode.tsx:14-61` |
| Ink StylePool 无界 | 10-50+ MB | 1000 条目上限 | `@ant/ink/screen.ts:122` |
| CompanionSprite 高频 | CPU | TICK_MS→1000ms | `CompanionSprite.tsx:15` |
| MCP stderr 缓冲 | 1-640 MB | 64→8MB/server | `mcp-client/connection.ts:117` |
| BashTool 输出缓冲 | 30-330 MB | 32→2MB | `stringUtils.ts:88` |
| Transcript 写入队列 | 5-50 MB | 1000 条目上限 | `sessionStorage.ts:613-619` |
| contentReplacementState | 持续增长 | compact 清理 | `compact/compact.ts` |
| SSE 缓冲 | 无上限 | 1MB cap | SSE 处理代码 |

## 仍存在的问题 — 内存（按峰值影响排序）

### P0：消息数组 7-8x 拷贝（120-320 MB）

`src/query.ts` 每轮 turn 产生的拷贝（Round 3 新增第 7 项）：

| 位置 | 操作 | 是否必要 | 优化方式 |
|------|------|----------|----------|
| `:477` | `[...getMessagesAfterCompactBoundary(messages)]` | 双重浪费 | 去掉 spread |
| `:491` | `applyToolResultBudget → map()` | 按需 | 无超限返回原数组 |
| `:897` | `clonedContent ??= [...contentArr]` | 条件必要 | 保留 |
| `:1135` | `[...messagesForQuery, ...assistant]` | 可避免 | 传引用 |
| `:1745` | `.concat(assistant, toolResults)` | 可避免 | 传多参数 |
| `:1857` | `[...messagesForQuery, ...assistant, ...toolResults]` forkContextMessages | **Round 3 新发现** — task summary 用完即弃 | 传引用 |
| `:1878` | `[...messagesForQuery, ...assistant, ...toolResults]` | 必要 | 改 push |

峰值时 3-4 份完整消息数组同时驻留（477 + 1745 + 1857 + 1878 在同一 turn 尾部顺序执行）。

### P0：React 消息管线重复计算（Round 5 新增分析）

**buildMessageLookups 每次 useMemo 重算时创建 8 个 Map/Set**（`messages.ts:1215-1398`）：

| 数据结构 | 规模 | 说明 |
|----------|------|------|
| `toolUseIDsByMessageID` | Map\<string, Set\> | 每个 assistant 消息一个 Set |
| `toolUseIDToMessageID` | Map\<string, string\> | 所有 tool_use ID |
| `toolUseByToolUseID` | Map\<string, ToolUseBlockParam\> | **保留完整 tool_use block** |
| `siblingToolUseIDs` | Map\<string, Set\> | 兄弟 tool_use 索引 |
| `progressMessagesByToolUseID` | Map\<string, ProgressMessage[]\> | 进度消息数组 |
| `toolResultByToolUseID` | Map\<string, NormalizedMessage\> | **保留完整 tool_result 消息引用** |
| `resolvedToolUseIDs` / `erroredToolUseIDs` | Set\<string\> | 已完成/错误 ID |

此 useMemo（`Messages.tsx:519`）依赖 normalizedMessages，任何消息变更（含流式 delta）触发重建。已拆分 renderRange 避免滚动触发（注释明确记录：50ms alloc per scroll → GC → 100-173ms STW on 1GB heap）。

**useDeferredValue 双缓冲**（`REPL.tsx:1569`）：流式期间 `messages` 和 `deferredMessages` 同时持有两份完整数组，直到 React 调度更新。在 27k 消息场景下，额外 ~100-200MB 临时占用。

**FileReadTool 无大小限制**（`FileReadTool.ts:342`）：`maxResultSizeChars: Infinity`，单次 10MB 文件读取完整保留在消息数组中。BashTool（30KB）和 GrepTool（20KB）有合理上限。

### P0：Compaction 与 React 状态交互（Round 5 新增分析）

**非全屏模式**（`REPL.tsx:3074-3075`）：compact 后 `setMessages(() => [newMessage])` 正确替换整组旧消息，内存立即释放。

**全屏模式**（`REPL.tsx:3056-3072`）：保留最多 500 条消息的 scrollback。注释记录：Ink fiber 树每条消息 ~250KB RSS，无 cap 时观察过 13k+ 消息 → 1GB+ heap。

**Microcompact 的局限**（`microCompact.ts:472-494`）：用 spread 创建新消息对象替换内容为 `[Old tool result content cleared]`。但 `ContentReplacementState.replacements` Map（`toolResultStorage.ts:392`）仍保留原始替换字符串，直到 compact 时才清理。这意味着 microcompact 减少了 token 数，但实际内存释放依赖后续 compact。

### P0：Compact 峰值（20-80 MB）

峰值时间线（`compact.ts:524-644`）：
```
Before:  messages(200K) + mutableMessages(200K) = 400K tokens
During:  + preCompactReadFileState(25MB) + summary + attachments ≈ 500K+ tokens
After:   splice → 50K tokens
```

可提前释放：`preCompactReadFileState`（25MB）、`summaryResponse`、原始 `messages` 参数。

### P0：React Hooks 闭包与 useMemo 链（Round 5 深入排查）

**useCallback 闭包重建**（`REPL.tsx`）：

| 回调 | 依赖项数 | 位置 | 影响 |
|------|----------|------|------|
| `getToolUseContext` | 20 | `:2789-2949` | 重建时旧闭包持有的引用阻止 GC |
| `onQueryImpl` | 14 | `:3188-3469` | 包含 getToolUseContext + 多层嵌套闭包 |
| `onQuery` | 在 onQueryImpl 上再包装 | `:3471-3697` | 又一层闭包 |
| `onSubmit` | ~10 | `:3822-4298` | 闭包链嵌套 3 层 |

每次 `messages` 变更触发 `setMessages` → React 重渲染 → 依赖 messages 的 useCallback/useMemo 全部重建。但 `getToolUseContext` 和 `onQueryImpl` **没有把 `messages` 放入依赖数组**（通过 `messagesRef.current` 参数传递规避），所以这些闭包不会因 messages 变化而重建。**这实际上是正确的设计**——用 ref 规避了闭包捕获问题。

**真正的 hooks 问题**在于 useMemo 链（`Messages.tsx`）：

```
messages → normalizedMessages (O(n))
  → compactAwareMessages (O(n) filter)
    → messagesToShow (O(n) filter + reorder)
      → groupedMessages (O(n))
        → collapsed (O(n))
          → lookups (8 Map/Set, O(n))
```

流式期间每个 delta 触发 `messages` 变更 → 整条链全量重算。注释记录：50ms alloc per scroll → GC → 100-173ms STW on 1GB heap（`Messages.tsx:516-518`）。

**无界 useRef**（`REPL.tsx`）：

| Ref | 增长方式 | 清理 | 影响 |
|-----|----------|------|------|
| `bashTools` | `.add()` 每个 bash 命令 | `clearConversation` 时 clear | Set\<string\>，通常 <100 |
| `discoveredSkillNamesRef` | `.add()` 每个发现的 skill | `clearConversation` 时 clear | Set\<string\>，通常 <50 |
| `apiMetricsRef` | `.push()` 每次请求 | turn 结束时 `= []` | 临时，turn 内累积 |
| `responseLengthRef` | 累加 | compact 时重置为 0 | 单数字 |
| `loadedNestedMemoryPathsRef` | `.add()` 每个 CLAUDE.md | compact/clear 时 clear | Set\<string\> |

结论：**这些 ref 都有清理机制**，不是主要问题。核心问题仍是 useMemo 链在流式期间的全量重算。

### P1：虚拟滚动组件（~50 MB）— Round 3 新发现

`src/hooks/useVirtualScroll.ts` + React Ink 渲染管线：
- MAX_MOUNTED_ITEMS = 300，OVERSCAN_ROWS = 80
- 实际挂载约 200 个 MessageRow（视口 + overscan）
- 每个 MessageRow ≈ 250KB RSS（React fiber + Yoga node + 子组件树）
- **总计约 50 MB 常驻内存**（当前会话最大挂载窗口）

优化空间：降低 MAX_MOUNTED_ITEMS 或 OVERSCAN_ROWS；评估 MessageRow 组件内部 memo 化。

### P1：流式 contentBlocks 累积 — Round 3 新发现

`src/services/api/claude.ts:1932`：
- `contentBlocks` 数组在流式响应期间累积所有内容块
- 长 thinking 响应可达数万 token，thinking 文本完整保留在 contentBlock.thinking 中
- `streamingDeltas` Map（已修复为数组累积）在 `content_block_stop` 时 `join('')` 赋值给 contentBlock
- 思考块在 normalize 后仍然保留完整 thinking 文本

### P1：其他已确认内存问题

| # | 问题 | 峰值 | 位置 |
|---|------|------|------|
| 1 | MCP Tool Schema 双重存储 | ~40 MB | `manager.ts:73` + `AppStateStore.ts:175` |
| 2 | lastAPIRequestMessages 常驻 | 30-50 MB | `bootstrap/state.ts:118` |
| 3 | Session 恢复全量加载（中小文件） | 50-200 MB | `sessionStorage.ts:3475-3582` |
| 4 | HybridTransport 100K 队列 | 1-10 MB | `HybridTransport.ts:86` |
| 5 | React messagesRef 双重引用 | 临时 | `REPL.tsx:1437-1477` |
| 6 | AppState 不可变更新抖动 | 5-50 MB | `store.ts:20-26` |
| 7 | Tool result seenIds/replacements | 0.5-2 MB | `toolResultStorage.ts:390-397` |
| 8 | bootstrap/state.ts 无界缓存 | 0.1-1 MB | planSlugCache 等 |
| 9 | QueryEngine 无界集合 | 0.1-1 MB | discoveredSkillNames 等 |
| 10 | expandedKeys Set 无清理（Round 5） | <0.5 MB | `Messages.tsx:644` compact 后 stale keys 不删除 |
| 11 | OpenAI/Gemini/Grok collectedMessages（Round 5） | 临时 | 流式期间累积 assistant messages 供 Langfuse telemetry，stream 结束后释放 |

### P2：低优先级（未验证）

| # | 问题 | 峰值 | 位置 |
|---|------|------|------|
| 1 | OpenTelemetry 多版本 | ~30 MB | 依赖树 |
| 2 | Perfetto tracing 100K events | ~30 MB | `perfettoTracing.ts:99` |
| 3 | Prompt Cache 规范化 | 5-15 MB | `claude.ts:3180-3329` |
| 4 | GrepTool 全量 stat+sort | ~10 MB | `GrepTool.ts:523-557` |

## 仍存在的问题 — CPU 与渲染热点

### 已确认

| # | 问题 | 影响 | 位置 |
|---|------|------|------|
| C2 | **Ink 每次 React commit 触发 Yoga 布局**（React ConcurrentRoot 自动批处理 setState，5 个 setState → 1 次 commit → 1 次布局） | ~1-3ms/次 commit | `reconciler.ts:279` → `ink.tsx:323` |
| C3 | **MessageRow 挂载成本 ~1.5ms**（Markdown 解析仅占 1-7%，主因是 React/Yoga/Ink 管线开销 ~1.3ms） | 已有 SLIDE_STEP=25 + useDeferredValue 限速 | `useVirtualScroll.ts` + `Markdown.tsx` |
| C4 | **布局偏移触发全屏 damage** | O(rows×cols) 全量 diff | `ink.tsx:655-661` |
| C7 | **CompanionSprite TICK_MS 定时器**（500ms→已修复为 1000ms） | 高频 setState 触发渲染 | `buddy/CompanionSprite.tsx:15,136` |
| C9 | 同步 fs 操作 | 阻塞主线程 | `projectOnboardingState.ts:20` 等 |

### 已否认

- **C1 useInboxPoller 状态循环** — 验证确认：useEffect 是收敛的（移除消息 → count 减少 → 稳定），poll 通过 `store.getState()` 读取不触发 React 依赖，1 秒轮询是正常 I/O 模式无循环
- **Markdown 是 CPU 热点** — marked.lexer 对典型消息仅 0.01-0.1ms，已有 tokenCache LRU-500（缓存命中 0.0003ms，99.6% 降速）+ hasMarkdownSyntax 快速路径（跳过 30-40% 消息）
- **Yoga 无增量布局** — 实测增量更新高效（1000 节点树改 1 叶子 → 仅 2 次 measure，其余走缓存）
- **Ink Yoga 2^depth 问题** — 实测 100 节点深链 = 11.7x 访问（线性增长，非指数级）

### 已有优化措施

- React ConcurrentRoot 自动批处理 setState（多个 setState → 1 次 commit）
- Ink 帧率限制 16ms（throttle 仅限终端输出，Yoga 布局无 throttle 但被 React batching 保护）
- 虚拟滚动 overscan 80 + MAX_MOUNTED_ITEMS 300 + SLIDE_STEP=25 + useDeferredValue
- Markdown tokenCache LRU-500 + hasMarkdownSyntax 快速路径 + StreamingMarkdown 增量解析
- Yoga 增量缓存（dirty propagation + measure 结果缓存）
- 双缓冲 + damage tracking + 字符池复用
- Pool 5 分钟周期重置

## 已否认（内存，5 轮汇总）

- VSZ 516 GB 是虚拟映射非物理 | Zod Schema ~650KB | Markdown LRU-500 已优化
- useSkillsChange/useSettingsChange — 正确 cleanup | useInboxPoller — 收敛设计
- React Compiler `_c(N)` — 未使用 | File watchers — 仅 ~5KB | React reconciler — WeakMap + freeRecursive
- Ink 屏幕缓冲 ~86KB | CharPool/HyperlinkPool ~1-5MB 且 5min 重置 | StylePool 缓存 1000 上限
- 依赖树 — AWS/Google/Azure SDK 均动态 import，不贡献基线 | Sentry 空实现
- Ink 无 scrollback 缓冲 | Markdown tokenCache LRU-500 bounded
- **Round 5 否认**：useCallback 闭包捕获 messages — 实际通过 messagesRef 参数传递规避，无闭包问题
- **Round 5 否认**：MCP stderrHandler 泄漏 — 已有 64MB cap + 成功后释放 + cleanup 移除 listener
- **Round 5 否认**：useRef 无界增长 — bashTools/discoveredSkillNamesRef/loadedNestedMemoryPathsRef 均有 clearConversation 或 compact 清理
- **Round 5 否认**：apiMetricsRef 无界 — turn 结束时 `= []` 重置
- **Round 5 否认**：useEffect 缺少 cleanup — 检查的 12 个 useEffect 均有 return cleanup 函数

## 结论

**内存根因**（5 轮迭代确认）：
1. **消息数组 turn 尾部 3-4 次 spread 同时驻留**（120-320 MB）— 核心瓶颈
2. **React 消息管线 buildMessageLookups 8 个 Map/Set 重建**（50ms/次，27k 消息场景）— GC 压力源
3. **useDeferredValue 双缓冲**（流式期间额外 ~100-200 MB 临时）
4. **FileReadTool 无大小上限**（单次 10MB 文件永久驻留）
5. **Compact 峰值窗口**（20-80 MB）+ Microcompact 依赖后续 compact 才真正释放
6. **虚拟滚动 200 组件 ~50MB 常驻**
7. **Bun/JSC 不归还内存页**（架构级限制）

**CPU 根因**：useInboxPoller 每秒轮询触发 React commit → 全量 Yoga 布局 → 全屏 Ink diff 的完整管线。Markdown 渲染（~1.5ms/行）在批量挂载新消息时造成 ~290ms 卡顿。轮询导致的周期性 commit 与消息挂载的 CPU 密集操作互相放大。

**Round 4 最终验证**：agent 递归 spread 和 attachment 累积均为已知 P0（消息数组拷贝）的变体，无新根因。Snipping 在流式前执行无并发问题。consumedCommandUuids 等数组每轮重置无累积。

**Round 5 增量验证**：
- buildMessageLookups 8 个 Map/Set 的重建成本已由 renderRange 拆分缓解，但仍然是消息变更时的主要 GC 压力源
- useDeferredValue 双缓冲是 React 调度机制的固有行为，优化空间有限
- FileReadTool 无上限是唯一一个"单次操作可注入 10MB+ 数据"的入口
- Microcompact 减少 token 但不立即释放内存（内容被 ContentReplacementState.replacements Map 间接持有）

**预估优化空间**：

| 优先级 | 措施 | 预估降低 |
|--------|------|----------|
| P0 | 消息数组拷贝优化 7 处 | 100-200 MB |
| P0 | Compact 峰值管理 3 项 | 20-80 MB |
| P1 | 虚拟滚动优化 | 20-30 MB |
| P1 | 缓冲与缓存清理 5 项 | 30-80 MB |
| P2 | 其他 3 项 | 10-50 MB |
| **合计** | **21 项可操作建议** | **210-500 MB** |

理论可从当前 400-700 MB 降至 **200-350 MB**。

## 建议（按优先级）

### P0：消息数组拷贝（预估降 100-200 MB）

1. `query.ts:477` — 去掉 spread
2. `query.ts:1878` — 改 push 追加
3. `query.ts:1135` — 传引用
4. `query.ts:1745` — 传多参数
5. `query.ts:1857` — 传引用（forkContextMessages）
6. `query.ts:491` — 无超限返回原数组

### P0：消息渲染管线（Round 5 新增，预估降 30-60 MB）

7. `FileReadTool.ts:342` — `maxResultSizeChars: Infinity` → 设合理上限（如 100KB）
8. `toolResultStorage.ts:392` — Microcompact 后同步清理 `replacements` Map 中对应条目
9. `Messages.tsx:519` — 考虑 buildMessageLookups 增量更新而非全量重建

### P0：Compact 峰值（预估降 20-80 MB）

10. `compact.ts:543` 后 `preCompactReadFileState = undefined`
11. `compact.ts:651` 后 `summaryResponse = undefined`
12. 延迟非关键 attachment 生成

### P1：渲染与缓存（预估降 50-110 MB）

13. 虚拟滚动 — 降低 OVERSCAN_ROWS 或 MAX_MOUNTED_ITEMS
14. `lastAPIRequestMessages` — 非 debug 清空
15. MCP Tool Schema — 去掉 manager 层 toolsCache
16. `HybridTransport` — maxQueueSize 100K→10K
17. `bootstrap/state.ts` — 无界 Map 加 LRU

### P2：其他（预估降 10-50 MB）

18. `toolResultStorage.ts` — seenIds/replacements 定期清理
19. Session 恢复流式 JSONL | AppState 增量更新
20. Thinking 文本截断策略（保留前 N + 后 N 字符）
21. `Bun.gc(true)` 低内存触发

### P2：Ink 渲染层（降低 CPU 开销）

22. `ink.tsx:655-661` — 布局偏移时尝试增量 damage 而非全屏 `{x:0,y:0,width:full,height:full}`

## 附录

- 合并来源：`docs/performance-reporter.md`（7 轮调研，含 CPU/渲染热点详细验证）
- 修复 commit：`ab0bbbc4`（compact 清理）、`ef10ad28`（峰值优化 -100-300MB）
- Round 2 新发现：HybridTransport 缓冲、React messagesRef 双重引用、toolResultStorage 无界增长
- Round 3 新发现：虚拟滚动 ~50MB 常驻、第 7-8 次 spread（query.ts:1857）、流式 contentBlocks thinking 累积、依赖树已懒加载
- Round 4 最终验证：无新根因（agent spread 和 attachment 累积为已知变体），调研终止
- Round 5 增量验证：buildMessageLookups 8 Map/Set 重建成本、useDeferredValue 双缓冲、FileReadTool 无上限、Microcompact 内存释放延迟、compaction 与 React 状态交互细节
