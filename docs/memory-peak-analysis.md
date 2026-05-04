# 内存与性能峰值分析报告

> 进程 bun，RSS 基线 **682 MB**，最差 **1.8 GB** | 2026-05-02 | **调研完成**（12 轮迭代）
> 修复 commit：`ef10ad28` + `ab0bbbc4`（降 100-300 MB）| 架构限制：Bun mimalloc/JSC 不归还内存页（~150-250 MB 永久占用）

## 已修复（10 项）

| 问题 | 原峰值 | 修复 | 位置 |
|------|--------|------|------|
| 流式字符串拼接 O(n²) | 2-20 MB | `+=` → 数组累积 | `claude.ts:1834,2271` |
| Messages.tsx 多次遍历 | 100-270 MB | 合并单次 pass | `Messages.tsx:417-418` |
| ColorFile 无缓存 | 50-100 MB | LRU-50 | `HighlightedCode.tsx:14-61` |
| Ink StylePool 无界 | 10-50+ MB | 1000 上限 | `@ant/ink/screen.ts:122` |
| CompanionSprite 高频 | CPU | TICK_MS→1000ms | `CompanionSprite.tsx:15` |
| MCP stderr 缓冲 | 1-640 MB | 64→8MB/server | `mcp-client/connection.ts:117` |
| BashTool 输出缓冲 | 30-330 MB | 32→2MB | `stringUtils.ts:88` |
| Transcript 写入队列 | 5-50 MB | 1000 上限 | `sessionStorage.ts:613-619` |
| contentReplacementState | 持续增长 | compact 清理 | `compact/compact.ts` |
| SSE 缓冲 | 无上限 | 1MB cap | SSE 处理代码 |

## P0 — 核心瓶颈（6 项）

| # | 问题 | 峰值 | 位置 | 建议 |
|---|------|------|------|------|
| 1 | 消息数组 7-8x spread 拷贝（turn 尾部 3-4 份同时驻留） | 120-320 MB | `query.ts` 7 处（:477,:491,:897,:1135,:1745,:1857,:1878） | 去掉 spread / 传引用 / 改 push |
| 2 | AutoCompact 时序缺陷（检查在 API 前，增长在 API 后） | API 超限 | `query.ts:575` | 加入预测式阈值检查 |
| 3 | reactiveCompact 空存根（API 413 时无紧急压缩） | 无降级 | `reactiveCompact.ts` 全文 | 实现真实逻辑 |
| 4 | buildMessageLookups 8 Map/Set 重建（流式每个 delta 触发） | GC STW 100-173ms | `Messages.tsx:519` | 增量更新 / 拆分 useMemo 链 |
| 5 | useDeferredValue 双缓冲 | 100-200 MB | `REPL.tsx:1569` | React 调度机制固有，优化空间有限 |
| 6 | Compact 峰值窗口（preCompactReadFileState + summary + attachments） | 20-80 MB | `compact.ts:524-644` | 提前释放 preCompactReadFileState/summaryResponse |

## P1 — 重要瓶颈（14 项）

| # | 问题 | 峰值 | 位置 | 建议 |
|---|------|------|------|------|
| 7 | OpenAI/Gemini/Grok 兼容层 O(n²) 拼接 | 25-75 MB | 3 文件 9 处（`openai/index.ts:386`, `gemini/index.ts:148`, `grok/index.ts:163`） | 改数组累积（同 claude.ts 模式） |
| 8 | messages.ts O(n²) 拼接 | 10-25 MB | `messages.ts:3252,3268` | 改数组累积 |
| 9 | highlight.js 全量 192 语言（仅需 26 种） | 8-12 MB | `color-diff-napi/index.ts:21` | 自定义构建 |
| 10 | hlLineCache 模块级单例 2048 条目 | ~4 MB | `color-diff-napi/index.ts:508` | 改 LRU + size 上限 |
| 11 | colorFileCache 3x 代码存储 | 2-5 MB | `HighlightedCode.tsx:14` | 移除 value 中 code 字段 |
| 12 | 虚拟滚动 200 组件常驻 | 50 MB | `useVirtualScroll.ts` | 降低 OVERSCAN_ROWS / MAX_MOUNTED_ITEMS |
| 13 | FileReadTool 大文件（输出上限 100K 字符，但读取期间完整加载） | 临时数 MB | `FileReadTool.ts:342` | 读取前检测大小，流式截断 |
| 14 | Session 恢复全量加载（磁盘→JSON→REPL 三阶段） | 200-300 MB | `sessionStorage.ts:3482` | 流式 JSONL / 增量恢复 |
| 15 | Session 写入 100MB 累积 | ~100 MB | `sessionStorage.ts:652` | 流式写入 |
| 16 | Forked Agent FileStateCache 完整克隆 | 50N MB | `forkedAgent.ts:382` | 共享/分层缓存（agent 用 10MB） |
| 17 | GC 阈值 350MB < 基线（每秒无意义强制 GC） | CPU 浪费 | `cli/print.ts:554` | 提高到 800MB+ |
| 18 | PDF 100 页处理 | ~100 MB | `apiLimits.ts:54` | 分页流式处理 |
| 19 | 图片单张处理（base64→解码→resize） | ~16 MB/张 | `apiLimits.ts:22` | 流式 resize |
| 20 | token 估算 ±25-50% 误差放大时序问题 | 阈值不准 | `tokenEstimation.ts:215` | 内容类型感知估算 |

## P2 — 次要问题（10 项）

| # | 问题 | 峰值 | 位置 |
|---|------|------|------|
| 21 | lastAPIRequestMessages 常驻 | 30-50 MB | `bootstrap/state.ts:118` |
| 22 | MCP Tool Schema 双重存储 | ~40 MB | `manager.ts:73` + `AppStateStore.ts:175` |
| 23 | ContentReplacementState 单调增长 | 0.5-2 MB | `toolResultStorage.ts:390` |
| 24 | Perfetto 100K 事件 | ~30 MB | `perfettoTracing.ts:106` |
| 25 | StreamingMarkdown 双渲染 | 临时 | `Markdown.tsx:185` |
| 26 | MarkdownTable 3 次遍历 | CPU 峰值 | `MarkdownTable.tsx:99` |
| 27 | 搜索索引 WeakMap | 5-10 MB | `transcriptSearch.ts:17` |
| 28 | ACP FileStateCache/会话 | 50 MB | `acp/agent.ts:554` |
| 29 | Agent initialMessages 浅拷贝 | 1-5 MB/agent | `runAgent.ts:382` |
| 30 | Hook 结果累积 | ~1 MB+ | `toolExecution.ts:1474` |

## CPU / 渲染热点

| # | 问题 | 影响 | 位置 |
|---|------|------|------|
| C2 | Ink 每次 React commit 触发 Yoga 布局 | ~1-3ms/commit | `reconciler.ts:279` → `ink.tsx:323` |
| C3 | MessageRow 挂载 ~1.5ms（React/Yoga/Ink 管线开销） | 批量挂载 ~290ms 卡顿 | `useVirtualScroll.ts` |
| C4 | 布局偏移触发全屏 damage | O(rows×cols) | `ink.tsx:655-661` |
| C9 | 同步 fs 操作阻塞主线程 | 间歇卡顿 | `projectOnboardingState.ts:20` 等 |

已有缓解：React ConcurrentRoot 批处理、帧率限制 16ms、虚拟滚动 overscan 80 + SLIDE_STEP=25 + useDeferredValue、Markdown tokenCache LRU-500 + hasMarkdownSyntax 快速路径、Yoga 增量缓存。

## 已否认（12 轮汇总）

VSZ 516 GB 是虚拟映射 | Zod ~650KB | Markdown LRU-500 已优化 | useSkillsChange/useSettingsChange 正确 cleanup | useInboxPoller 收敛设计（非循环）| React Compiler `_c(N)` 未使用 | File watchers ~5KB | React reconciler WeakMap + freeRecursive | Ink 屏幕缓冲 ~86KB | CharPool/HyperlinkPool ~1-5MB 5min 重置 | AWS/Google/Azure SDK 均懒加载 | Sentry 空实现 | useCallback 闭包通过 messagesRef 规避（无泄漏）| MCP stderrHandler 有 64MB cap + cleanup | useRef 有 clearConversation/compact 清理 | apiMetricsRef turn 结束重置 | useEffect 有 cleanup 函数 | lodash-es tree-shakable | AppState useSyncExternalStore 仅相关切片更新 | SDK 无全局重试队列 | Ink unmount 有清理

## 结论

**内存根因排序**：
1. 消息数组 7-8x spread 拷贝（120-320 MB）— 核心瓶颈
2. useDeferredValue 双缓冲 + React useMemo 链全量重算（100-200 MB + GC STW）
3. Session 恢复/写入峰值（200-300 MB）
4. AutoCompact 时序缺陷 + reactiveCompact 空存根（API 超限风险）
5. Forked Agent FileStateCache 克隆（50N MB）
6. 虚拟滚动 200 组件 ~50MB 常驻
7. Bun/JSC 不归还内存页（架构级）

**CPU 根因**：useInboxPoller 每秒轮询 → React commit → Yoga 布局 → 全屏 Ink diff 完整管线。Markdown 渲染批量挂载时 ~290ms 卡顿。

**预估优化空间**：

| 优先级 | 措施数 | 预估降低 |
|--------|--------|----------|
| P0 | 6 | 240-600 MB |
| P1 | 14 | 300-600 MB |
| P2 | 10 | 80-200 MB |
| **合计** | **30 项** | **620-1400 MB** |

理论可从 400-700 MB 降至 **200-350 MB**（受 mimalloc/JSC 架构限制约束）。
