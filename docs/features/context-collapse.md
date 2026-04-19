# CONTEXT_COLLAPSE — 上下文折叠

> Feature Flag: `FEATURE_CONTEXT_COLLAPSE=1`
> 子 Feature: `FEATURE_HISTORY_SNIP=1`
> 实现状态：核心逻辑全部 Stub，布线完整
> 引用数：CONTEXT_COLLAPSE 20 + HISTORY_SNIP 16 = 36

## 一、功能概述

CONTEXT_COLLAPSE 让模型内省上下文窗口使用情况，并智能压缩旧消息。当对话接近上下文限制时，自动将旧消息折叠为压缩摘要，保留关键信息的同时释放 token 空间。

### 子 Feature

| Feature | 功能 |
|---------|------|
| `CONTEXT_COLLAPSE` | 上下文折叠引擎（后台 LLM 调用压缩旧消息） |
| `HISTORY_SNIP` | SnipTool — 标记消息进行折叠/修剪 |

## 二、实现架构

### 2.1 模块状态

| 模块 | 文件 | 状态 |
|------|------|------|
| 折叠核心 | `src/services/contextCollapse/index.ts` | **Stub** — 接口完整（`ContextCollapseStats`、`CollapseResult`、`DrainResult`），函数全部空操作 |
| 折叠操作 | `src/services/contextCollapse/operations.ts` | **Stub** — `projectView` 为恒等函数 |
| 折叠持久化 | `src/services/contextCollapse/persist.ts` | **Stub** — `restoreFromEntries` 为空操作 |
| CtxInspectTool | `packages/builtin-tools/src/tools/CtxInspectTool/CtxInspectTool.ts` | **实现** — 上下文内省工具 |
| SnipTool 提示 | `src/tools/SnipTool/prompt.ts` | **Stub** — 空工具名 |
| SnipTool 实现 | `src/tools/SnipTool/SnipTool.ts` | **缺失** |
| force-snip 命令 | `src/commands/force-snip.js` | **缺失** |
| 折叠读取搜索 | `src/utils/collapseReadSearch.ts` | **完整** — Snip 作为静默吸收操作 |
| QueryEngine 集成 | `src/QueryEngine.ts` | **布线** — 导入并使用 snip 投影 |
| Token 警告 UI | `src/components/TokenWarning.tsx` | **布线** — 折叠进度标签 |

### 2.2 核心接口（已定义，待实现）

```ts
// contextCollapse/index.ts
interface ContextCollapseStats {
  // 上下文使用统计
}
interface CollapseResult {
  // 折叠操作结果
}
interface DrainResult {
  // 紧急释放结果
}

// 关键函数（全部 stub）：
isContextCollapseEnabled()          // → false
applyCollapsesIfNeeded(messages)    // 透传
recoverFromOverflow(messages)       // 透传（413 恢复）
initContextCollapse()               // 空操作
```

### 2.3 预期数据流

```
对话持续增长
      │
      ▼
上下文接近限制（由 query.ts 检测）
      │
      ├── 溢出检测 (query.ts:440,616,802)
      │
      ▼
applyCollapsesIfNeeded(messages) [需要实现]
      │
      ├── 后台 LLM 调用压缩旧消息
      ├── 保留关键信息（决策、文件路径、错误）
      └── 替换旧消息为压缩摘要
      │
      ├── 413 恢复 (query.ts:1093,1179)
      │   └── recoverFromOverflow() 紧急折叠
      │
      ▼
projectView() 过滤折叠后的消息视图
      │
      ▼
模型继续工作（在压缩后的上下文中）
```

### 2.4 HISTORY_SNIP 子功能

SnipTool 提供手动折叠能力：

- `/force-snip` 命令 — 强制执行折叠
- SnipTool — 标记特定消息进行折叠/修剪
- `collapseReadSearch.ts` 已完整实现，将 Snip 作为静默吸收操作处理

### 2.5 集成点

| 文件 | 位置 | 说明 |
|------|------|------|
| `src/query.ts` | 18,440,616,802,1093,1179 | 溢出检测、413 恢复、折叠应用 |
| `src/QueryEngine.ts` | 124,127,1301 | Snip 投影使用 |
| `src/utils/analyzeContext.ts` | 1122 | 跳过保留缓冲区显示 |
| `src/utils/sessionRestore.ts` | 127,494 | 恢复折叠状态 |
| `src/services/compact/autoCompact.ts` | 179,215 | 自动压缩时考虑折叠 |

## 三、需要补全的内容

| 优先级 | 模块 | 工作量 | 说明 |
|--------|------|--------|------|
| 1 | `services/contextCollapse/index.ts` | 大 | 折叠状态机、LLM 调用、消息压缩 |
| 2 | `services/contextCollapse/operations.ts` | 中 | `projectView()` 消息过滤 |
| 3 | `services/contextCollapse/persist.ts` | 小 | `restoreFromEntries()` 磁盘持久化 |
| 4 | `tools/CtxInspectTool/` | 已完成 | 上下文内省工具已实现（`packages/builtin-tools/src/tools/CtxInspectTool/`） |
| 5 | `tools/SnipTool/SnipTool.ts` | 中 | Snip 工具实现 |
| 6 | `commands/force-snip.js` | 小 | `/force-snip` 命令 |

## 四、关键设计决策

1. **后台 LLM 压缩**：折叠不是简单截断，而是用 LLM 生成压缩摘要保留关键信息
2. **413 恢复**：当 API 返回 413（请求过大）时，紧急折叠是最重要的恢复手段
3. **与 autoCompact 协作**：折叠和自动压缩（compact）是不同的机制，折叠在消息级别，压缩在对话级别
4. **持久化**：折叠状态持久化到磁盘，会话恢复时重载

## 五、使用方式

```bash
# 启用 context collapse
FEATURE_CONTEXT_COLLAPSE=1 bun run dev

# 启用 snip 子功能
FEATURE_CONTEXT_COLLAPSE=1 FEATURE_HISTORY_SNIP=1 bun run dev
```

## 六、文件索引

| 文件 | 职责 |
|------|------|
| `src/services/contextCollapse/index.ts` | 折叠核心（stub，接口已定义） |
| `src/services/contextCollapse/operations.ts` | 投影操作（stub） |
| `src/services/contextCollapse/persist.ts` | 持久化（stub） |
| `src/utils/collapseReadSearch.ts` | Snip 吸收操作（完整） |
| `src/query.ts` | 溢出检测和 413 恢复集成 |
| `src/QueryEngine.ts` | Snip 投影使用 |
| `src/components/TokenWarning.tsx` | 折叠进度 UI |
