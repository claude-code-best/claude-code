# Context Management 双机制深度分析

## 概述

项目中存在两套上下文管理机制，它们**不是独立的平行系统**，而是不同层次的互补机制，可以同时注入到同一个 API 请求中。

## 两套机制对比

### cachedMicrocompact（`cache_edits` 机制）

- **文件**: `src/services/compact/cachedMicrocompact.ts` + `src/services/compact/microCompact.ts:276-286`
- **运行阶段**: API 调用**之前**，在 `query.ts:457` 中通过 `microcompactMessages()` 执行
- **注入方式**: 在 `addCacheBreakpoints()`（`claude.ts:3149-3298`）中嵌入消息体内部：
  - 给 tool_result 添加 `cache_reference: tool_use_id`（第 3253-3294 行）
  - 将 `cache_edits` block 插入用户消息（第 3228-3247 行）
  - 历史 pinned edits 重新插入原位置（第 3213-3225 行）
- **核心价值**: **保留 prompt cache 前缀不失效**。通过 cache 层操作删除指定 tool result，不触发完整前缀重写
- **触发条件**: 工具计数超阈值（默认 10 个，客户端维护 `CachedMCState`）
- **状态管理**: 有状态——`registeredTools`、`deletedRefs`、`pinnedEdits`。后续请求必须重发历史删除
- **适用场景**: **缓存热**（频繁交互，缓存 TTL 内）
- **当前状态**: 未发布的内部 API，`CACHE_EDITING_BETA_HEADER = ''`，`CACHED_MICROCOMPACT` feature flag 未注册

### apiMicrocompact（`context_management` 公开 API）

- **文件**: `src/services/compact/apiMicrocompact.ts`
- **运行阶段**: 构建 API 请求参数**时**，在 `claude.ts:1684` 的 `paramsFromContext` 内调用
- **注入方式**: 作为顶层字段 `context_management: { edits: [...] }` 发送（`claude.ts:1775-1779`）
- **核心价值**: **声明式策略配置**——告诉 API "超过 X token 时自动清理最旧的 tool result"
- **触发条件**: Token 超阈值（服务端评估，默认 180K input tokens）
- **状态管理**: 无状态——每次请求独立声明策略
- **缓存行为**: **会失效 prompt cache 前缀**（Anthropic 文档："Invalidates cached prompt prefixes when content is cleared"）。需要 `clear_at_least` 参数确保清理量值得缓存失效代价
- **适用场景**: **缓存冷或阈值兜底**（不在乎缓存失效）
- **当前状态**: 已发布公开 API，使用 `context-management-2025-06-27` beta header（已在项目中定义）

## 调用时序

```
用户发消息
  │
  ├─ query.ts:457 → microcompactMessages()
  │   ├─ ① time-based MC（缓存冷时 content-clear，短路退出）
  │   └─ ② cachedMicrocompact（缓存热时 cache_edits，不修改消息内容）
  │       └→ 排队 pendingCacheEdits
  │
  └─ claude.ts:paramsFromContext()
      ├─ 消费 pendingCacheEdits → consumedCacheEdits
      ├─ getAPIContextManagement() → contextManagement
      └─ 构建请求体:
          ├─ messages: addCacheBreakpoints(..., useCachedMC, consumedCacheEdits, pinnedEdits)
          │              └→ cache_reference + cache_edits 嵌入消息内部
          └─ context_management: contextManagement
                     └→ 顶层字段，声明式策略
```

**互斥关系**:
- time-based MC 触发时**跳过** cachedMC（`microCompact.ts:264-266`："Cached MC is skipped when this fires: editing assumes a warm cache"）
- cachedMC 和 apiMC **可以同时生效**——分别注入到消息内部和顶层字段

## 协作设计意图

两者的设计是**分层互补**:

1. **cachedMC（热缓存优化）**: 在缓存有效期内（~5 分钟），精细删除单个 tool result，**零缓存失效代价**。适合频繁交互的场景。
2. **apiMC（阈值兜底）**: 当 input token 超过阈值时，由服务端批量清理。**代价是缓存失效**，但确保不会超限。
3. **time-based MC（冷缓存兜底）**: 当空闲超时导致缓存过期时，客户端直接 content-clear 消息体，为重写缓存做准备。

## 当前门控限制

### cachedMicrocompact 门控

| 门控 | 位置 | 值 | 影响 |
|------|------|-----|------|
| `feature('CACHED_MICROCOMPACT')` | `microCompact.ts:276` | `false`（未注册） | 整条路径不可达 |
| `CLAUDE_CACHED_MICROCOMPACT=1` | `cachedMicrocompact.ts:27` | 未设置 | 启用检查失败 |
| `CACHE_EDITING_BETA_HEADER` | `betas.ts:50` | `''`（空） | API 层 `cachedMCEnabled=false` |

### apiMicrocompact 门控

| 门控 | 位置 | 值 | 影响 |
|------|------|-----|------|
| `USER_TYPE=ant` | `apiMicrocompact.ts:90` | 非 ant | tool clearing 不触发 |
| `USE_API_CLEAR_TOOL_RESULTS=1` | `apiMicrocompact.ts:94` | 未设置 | tool result 清理不启用 |
| `USE_API_CLEAR_TOOL_USES=1` | `apiMicrocompact.ts:97` | 未设置 | tool use 清理不启用 |
| `CONTEXT_MANAGEMENT_BETA_HEADER` | `betas.ts:7` | `context-management-2025-06-27` | **已可用** ✓ |
| `modelSupportsContextManagement()` | `betas.ts:282` | Opus 4.6+, Sonnet 4.6 = true | **已可用** ✓ |
| `clear_thinking_20251015` | `apiMicrocompact.ts:82-87` | 有 thinking 时启用 | **已生效** ✓（所有用户） |

## 已知问题

### P0: cachedMicrocompact 的 `deletedRefs` 未填充

详见 `docs/bugs/cached-microcompact-issues.md` 问题 1。

### P1: 类型不安全的 `as any` 桥接

`claude.ts:1763-1764` 中 `consumedCacheEdits` 和 `consumedPinnedEdits` 通过 `as any` 传入 `addCacheBreakpoints`。`CacheEditsBlock.edits` 的类型是 `{ type: string; tool_use_id: string }`，而 `addCacheBreakpoints` 期望的是 `{ type: 'delete'; cache_reference: string }`。两者字段名不同（`tool_use_id` vs `cache_reference`），靠 `as any` 掩盖了类型不匹配。

### P2: 两机制同时存在时的 API 行为未定义

目前无文档说明 Anthropic API 如何处理 `cache_edits`（消息内嵌）和 `context_management`（顶层字段）同时存在的情况。可能存在未定义交互。

## 启用方案

### 方案 A: 仅启用 apiMicrocompact（推荐，可立即实施）

1. **移除 `USER_TYPE=ant` 门控**（`apiMicrocompact.ts:90`），改为环境变量或 settings 控制
2. **默认启用 tool clearing**（移除 `USE_API_CLEAR_TOOL_RESULTS` env 检查，或设置默认值）
3. Beta header 和 `context_management` 注入逻辑已就绪，无需额外改动

代价：缓存失效（每次清理触发缓存前缀重写），但对订阅用户来说这不是问题（按使用量计费，不按缓存写入计费）。

### 方案 B: 同时启用两者（需等 cache_edits API 可用）

1. 先完成方案 A
2. 修复 `deletedRefs` bug
3. 等 `CACHE_EDITING_BETA_HEADER` 有值后启用 cachedMC
4. 两者共存：cachedMC 在缓存热时精细操作，apiMC 在超限时兜底

### 方案 C: 用 `CACHE_EDITING_BETA_HEADER = CONTEXT_MANAGEMENT_BETA_HEADER` 尝试

将 `CACHE_EDITING_BETA_HEADER` 设为 `'context-management-2025-06-27'`，测试 API 是否接受消息内嵌的 `cache_reference` + `cache_edits`。如果接受，说明两者确实共用同一个 beta header。

## API 实测验证（2026-04-21 OAuth 订阅账户）

1. `/v1/models` 确认 Opus 4.7/4.6/Sonnet 4.6 都支持 `context_management`，含三种策略：
   - `clear_tool_uses_20250919` ✓
   - `clear_thinking_20251015` ✓
   - `compact_20260112` ✓（服务端压缩，新发现）
2. `context-management-2025-06-27` beta header 被 API 接受（`context_management` 字段不报错）
3. `cache_edits` 内嵌机制未测试（需要 beta header 值）

## 2026-04-21 已实施的修复

### 解除 `USER_TYPE=ant` 门控

**`apiMicrocompact.ts:89-92`**：移除 `if (process.env.USER_TYPE !== 'ant')` 整个 early return block。`clear_tool_uses_20250919` 默认对所有用户启用，可通过 `USE_API_CLEAR_TOOL_RESULTS=0` 环境变量禁用。

**`betas.ts:277-289`**：移除 `antOptedIntoToolClearing` 变量中的 `process.env.USER_TYPE === 'ant'` 条件，改为 `modelSupportsContextManagement(model) || USE_API_CONTEXT_MANAGEMENT=1`。beta header 注入不再依赖 ant 身份。

### 验证结果

- tsc 零错误
- compact 相关 35 tests 全部通过
- beta header 17 tests 全部通过
- 全量 3415 pass / 1 fail（deep link 无关测试）/ 268 files

## 参考文件

- [Anthropic Context Editing 文档](https://docs.anthropic.com/en/docs/build-with-claude/context-editing)
- `src/services/compact/microCompact.ts` — 入口及时序（第 253-293 行）
- `src/services/compact/cachedMicrocompact.ts` — cache_edits 实现
- `src/services/compact/apiMicrocompact.ts` — context_management 实现
- `src/services/api/claude.ts:1579-1583` — consumedCacheEdits/consumedPinnedEdits 准备
- `src/services/api/claude.ts:1684-1688` — contextManagement 获取
- `src/services/api/claude.ts:1726-1741` — useCachedMC 和 beta header 注入
- `src/services/api/claude.ts:1756-1779` — 两者同时注入到请求体
- `src/services/api/claude.ts:3149-3298` — addCacheBreakpoints 完整实现
- `src/utils/betas.ts:277-289` — CONTEXT_MANAGEMENT_BETA_HEADER 注入条件
