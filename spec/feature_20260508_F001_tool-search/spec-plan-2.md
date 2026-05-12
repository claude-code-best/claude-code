# Tool Search 执行计划（二）— 集成层

**目标:** 将基础设施层的组件集成到系统中——系统提示词增强、工具注册、预取管道、用户推荐 UI

**技术栈:** TypeScript, React (Ink), Bun, Zod

**设计文档:** spec/feature_20260508_F001_tool-search/spec-design.md

**前置:** spec-plan-1.md（Task 1-4）已完成

## 改动总览

- 在系统提示词添加 ToolSearch + ExecuteTool 引导指令，tools.ts 注册 ExecuteTool，toolSearch.ts 更新过时注释；新建预取管道 prefetch.ts 集成到 attachments.ts 和 query.ts（复用 skill prefetch 模式）；新建 ToolSearchHint.tsx Ink 组件集成到 REPL
- Task 5（系统提示词与注册）是 Task 6/7 的前置；Task 6（预取管道）被 Task 7（UI）依赖
- 关键决策：预取管道完全复用 skill prefetch 的触发/消费模式；UI 组件参考 PluginHintMenu 模式

---

---

### Task 0: 环境准备（轻量）

**背景:**
Plan 1 的环境验证已完成，此处仅需确认 Plan 1 的产出文件可用。

**执行步骤:**
- [x] 确认 Plan 1 产出文件存在
  - `ls src/constants/tools.ts src/services/toolSearch/toolIndex.ts packages/builtin-tools/src/tools/ExecuteTool/ExecuteTool.ts 2>&1`
  - 预期: 所有文件存在

**检查步骤:**
- [x] Plan 1 核心常量可被引用
  - `grep "CORE_TOOLS" src/constants/tools.ts | head -3`
  - 预期: 输出包含 CORE_TOOLS 定义

---

---

### Task 5: 系统提示词与工具注册

**背景:**
[业务语境] — 本 Task 将 Task 3 创建的 ExecuteTool 注册到系统工具池中，并在系统提示词中添加 ToolSearch + ExecuteTool 的使用引导，确保模型知道如何发现和调用延迟工具。
[修改原因] — 当前系统提示词（L192）仅提到"延迟工具必须通过 ToolSearch 或 DiscoverSkills 加载"，缺少 ExecuteTool 的引导。`src/tools.ts` 的 `getAllBaseTools()` 中未注册 ExecuteTool。`src/utils/toolSearch.ts` 的 `isToolSearchEnabled()` 和 `isToolSearchEnabledOptimistic()` 内部已通过 `isDeferredTool` 间接使用 `CORE_TOOLS`（Task 1 重构后），需确认无遗留的 `shouldDefer` 直接引用。
[上下游影响] — 本 Task 依赖 Task 1（`CORE_TOOLS`、`isDeferredTool` 白名单制）和 Task 3（ExecuteTool 工具包创建完成）。本 Task 的输出被 Task 6（预取管道）和 Task 7（用户推荐 UI）依赖。

**涉及文件:**
- 修改: `src/constants/prompts.ts`
- 修改: `src/tools.ts`
- 修改: `src/utils/toolSearch.ts`

**执行步骤:**

- [x] 在 `src/constants/prompts.ts` 中添加 ToolSearch + ExecuteTool 引导指令到系统提示词
  - 位置: `src/constants/prompts.ts` 的 `getSimpleSystemSection()` 函数内，在 L192 的延迟工具说明条目之后
  - 当前 L192 内容为:
    ```
    `Your visible tool list is partial by design — many tools (deferred tools, skills, MCP resources) must be loaded via ToolSearch or DiscoverSkills before you can call them. Before telling the user that a capability is unavailable, search for a tool or skill that covers it. Only state something is unavailable after the search returns no match.`,
    ```
  - 在此条目之后（L193 之前）插入新条目:
    ```typescript
    `When you need a capability that isn't in your available tools, use ToolSearch to discover and load it. ToolSearch can find all deferred tools by keyword or task description. After discovering a tool, use ExecuteTool to invoke it with the appropriate parameters. Common deferred tools include: CronTools (scheduling), WorktreeTools (git isolation), SnipTool (context management), DiscoverSkills (skill search), MCP resource tools, and many more. Always search first rather than assuming a capability is unavailable.`,
    ```
  - 在文件顶部 import 区域新增:
    ```typescript
    import { EXECUTE_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/ExecuteTool/constants.js'
    ```
  - 注意: `TOOL_SEARCH_TOOL_NAME` 已通过 `src/constants/tools.ts` 的 import 链路导入（L25 `import { TOOL_SEARCH_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/ToolSearchTool/prompt.js'`），无需重复导入。但需在 `prompts.ts` 中新增 `EXECUTE_TOOL_NAME` 的 import（当前文件中无此 import，经 grep 确认）。
  - 原因: 模型需要明确知道 ExecuteTool 的存在和用法，否则发现延迟工具后不知道如何调用

- [x] 在 `src/tools.ts` 的 `getAllBaseTools()` 中注册 ExecuteTool
  - 位置: `src/tools.ts` 的 `getAllBaseTools()` 函数内，在 L272 `...(isToolSearchEnabledOptimistic() ? [ToolSearchTool] : [])` 之后
  - 在文件顶部 import 区域（L84 附近，ToolSearchTool import 之后）新增:
    ```typescript
    import { ExecuteTool } from '@claude-code-best/builtin-tools/tools/ExecuteTool/ExecuteTool.js'
    ```
  - 将 L272:
    ```typescript
    ...(isToolSearchEnabledOptimistic() ? [ToolSearchTool] : []),
    ```
  - 修改为:
    ```typescript
    ...(isToolSearchEnabledOptimistic() ? [ToolSearchTool, ExecuteTool] : []),
    ```
  - 原因: ExecuteTool 与 ToolSearchTool 联动启用，在相同条件块中注册确保两者同时可用或同时不可用

- [x] 在 `src/utils/toolSearch.ts` 中更新模块文档注释，移除过时的 `shouldDefer` 引用
  - 位置: `src/utils/toolSearch.ts` 文件顶部模块文档注释（L1-L7）
  - 当前 L4 内容为:
    ```
`
  * When enabled, deferred tools (MCP and shouldDefer tools) are sent with
  * defer_loading: true and discovered via ToolSearchTool rather than being
  * loaded upfront.
  ```
  - 修改为:
    ```
`
  * When enabled, deferred tools (all non-core tools) are sent with
  * defer_loading: true and discovered via ToolSearchTool rather than being
  * loaded upfront. Core tools are defined in CORE_TOOLS (src/constants/tools.ts).
  ```
  - 位置: `src/utils/toolSearch.ts` 的 `ToolSearchMode` 类型文档注释（L155-L156）
  - 当前内容为:
    ```
`
  * Tool search mode. Determines how deferrable tools (MCP + shouldDefer) are
  * surfaced:
  ```
  - 修改为:
    ```
`
  * Tool search mode. Determines how deferred tools (all non-core tools)
  * are surfaced:
  ```
  - 位置: `src/utils/toolSearch.ts` 的 `getToolSearchMode()` 函数文档注释（L170）
  - 当前内容为:
    ```
`
  *   (unset)               tst (default: always defer MCP and shouldDefer tools)
  ```
  - 修改为:
    ```
`
  *   (unset)               tst (default: always defer non-core tools)
  ```
  - 位置: `src/utils/toolSearch.ts` 的 `getToolSearchMode()` 函数末尾 return 注释（L197）
  - 当前内容为:
    ```typescript
  return 'tst' // default: always defer MCP and shouldDefer tools
    ```
  - 修改为:
    ```typescript
  return 'tst' // default: always defer non-core tools
    ```
  - 注意: `shouldDefer` 在此文件中仅出现在注释中（L4, L155, L170, L197），无任何运行时引用。`isDeferredTool` 函数从 `@claude-code-best/builtin-tools/tools/ToolSearchTool/prompt.js` 导入（L24），Task 1 已将其重构为白名单制，此处无需修改函数调用。
  - 原因: Task 1 将 `isDeferredTool` 重构为白名单制后，`shouldDefer` 概念已过时。更新注释保持文档与实现一致。

- [x] 为 Task 5 的三个修改点编写单元测试
  - 测试文件: `src/__tests__/toolSearchIntegration.test.ts`（新建）
  - 测试场景:
    - `getSystemPrompt` 包含 ExecuteTool 引导: 调用 `getSystemPrompt(mockTools, model)` 后，结果字符串中包含 "ExecuteTool" 和 "ToolSearch" 关键词
    - `getAllBaseTools` 包含 ExecuteTool 当 tool search 启用时: mock `isToolSearchEnabledOptimistic` 返回 `true`，验证 `getAllBaseTools()` 返回的工具列表中包含 `name: 'ExecuteTool'` 的工具
    - `getAllBaseTools` 不包含 ExecuteTool 当 tool search 禁用时: mock `isToolSearchEnabledOptimistic` 返回 `false`，验证 `getAllBaseTools()` 返回的工具列表中不包含 `name: 'ExecuteTool'` 的工具
    - `getAllBaseTools` 中 ExecuteTool 紧随 ToolSearchTool: 验证在 tool search 启用时，ExecuteTool 在工具列表中的位置紧跟 ToolSearchTool
  - Mock 策略: 使用 `bun:test` 的 `mock` 函数 mock `src/utils/toolSearch.js` 的 `isToolSearchEnabledOptimistic`
  - 运行命令: `bun test src/__tests__/toolSearchIntegration.test.ts`
  - 预期: 所有测试通过

**检查步骤:**

- [x] 验证系统提示词包含 ExecuteTool 引导
  - `grep -n "ExecuteTool" src/constants/prompts.ts`
  - 预期: 至少 2 行（import + 引导文本）

- [x] 验证 ExecuteTool 已注册到 getAllBaseTools
  - `grep -n "ExecuteTool" src/tools.ts`
  - 预期: 至少 2 行（import + 注册）

- [x] 验证 ExecuteTool 与 ToolSearchTool 在同一条件块中注册
  - `grep -A1 "isToolSearchEnabledOptimistic" src/tools.ts | grep -c "ExecuteTool"`
  - 预期: 输出 1（ExecuteTool 在 isToolSearchEnabledOptimistic 条件块中）

- [x] 验证 toolSearch.ts 中无运行时 shouldDefer 引用（仅注释）
  - `grep -n "shouldDefer" src/utils/toolSearch.ts`
  - 预期: 无输出或仅在注释中出现

- [x] 验证 TypeScript 编译无错误
  - `bunx tsc --noEmit --pretty 2>&1 | head -30`
  - 预期: 无新增类型错误

- [x] 运行新增单元测试
  - `bun test src/__tests__/toolSearchIntegration.test.ts`
  - 预期: 所有测试通过

- [x] 验证现有 tools.test.ts 未回归
  - `bun test src/__tests__/tools.test.ts`
  - 预期: 所有测试通过

---

### Task 6: 预取管道

**背景:**
[业务语境] — 本 Task 实现工具搜索预取管道，在用户输入后异步触发 TF-IDF 工具搜索，将推荐结果以 attachment 消息注入 API 请求，使模型在每轮对话中自动获得最相关的延迟工具提示。
[修改原因] — 当前项目仅实现了 skill 搜索的预取管道（`skillSearch/prefetch.ts`），缺少工具维度的预取。工具预取需复用 skill prefetch 的集成模式（turn-0 阻塞式 + inter-turn 异步式），但使用独立的 attachment type（`tool_discovery`）和独立的搜索函数（`toolIndex.searchTools`）。
[上下游影响] — 本 Task 依赖 Task 2（`toolIndex.ts` 的 `getToolIndex` 和 `searchTools`）。本 Task 的输出（`prefetch.ts` 模块和集成代码）被 Task 7（用户推荐 UI）间接依赖，UI 组件需要消费预取结果来渲染推荐提示条。

**涉及文件:**
- 新建: `src/services/toolSearch/prefetch.ts`
- 修改: `src/utils/attachments.ts`
- 修改: `src/query.ts`

**执行步骤:**

- [x] 新建 `src/services/toolSearch/prefetch.ts`，定义 `ToolDiscoveryResult` 类型和 `tool_discovery` attachment 构建函数
  - 位置: 新建文件 `src/services/toolSearch/prefetch.ts`，文件开头
  - 导入依赖:
    ```typescript
    import type { Attachment } from '../../utils/attachments.js'
    import type { Message } from '../../types/message.js'
    import type { Tool } from '../../Tool.js'
    import { getToolIndex, searchTools } from './toolIndex.js'
    import type { ToolSearchResult } from './toolIndex.js'
    import { logForDebugging } from '../../utils/debug.js'
    ```
  - 定义 `ToolDiscoveryResult` 类型:
    ```typescript
    export type ToolDiscoveryResult = {
      name: string
      description: string
      searchHint: string | undefined
      score: number
      isMcp: boolean
      isDeferred: boolean
      inputSchema: object | undefined
    }
    ```
  - 定义 `buildToolDiscoveryAttachment` 函数:
    ```typescript
    function buildToolDiscoveryAttachment(
      tools: ToolDiscoveryResult[],
      trigger: 'assistant_turn' | 'user_input',
      queryText: string,
      durationMs: number,
      indexSize: number,
    ): Attachment {
      return {
        type: 'tool_discovery',
        tools,
        trigger,
        queryText: queryText.slice(0, 200),
        durationMs,
        indexSize,
      } as Attachment
    }
    ```
  - 原因: `tool_discovery` 作为独立的 attachment type 与 `skill_discovery` 并列，数据结构不同（工具无 `shortId`/`autoLoaded`/`content`/`path`/`gap`，增加 `searchHint`/`isMcp`/`isDeferred`/`inputSchema`），不能复用 `skill_discovery` 类型

- [x] 实现 `startToolSearchPrefetch` 异步预取函数 — inter-turn 场景，在 query loop 中异步触发
  - 位置: `src/services/toolSearch/prefetch.ts`，在 `buildToolDiscoveryAttachment` 之后
  - 函数签名:
    ```typescript
    export async function startToolSearchPrefetch(
      tools: Tool[],
      messages: Message[],
    ): Promise<Attachment[]>
    ```
  - 核心逻辑（参照 `skillSearch/prefetch.ts:startSkillDiscoveryPrefetch` L249-296 的模式）:
    1. 调用 `extractQueryFromMessages(null, messages)` 提取用户查询文本（复用 `skillSearch/prefetch.ts` 导出的 `extractQueryFromMessages` 函数，该函数已导出且逻辑通用）
    2. `queryText` 为空时返回 `[]`
    3. 记录 `startedAt = Date.now()`
    4. 调用 `getToolIndex(tools)` 获取缓存的工具索引
    5. 调用 `searchTools(queryText, index, 3)` 搜索 top-3 工具（预取场景限制 3 条，减少 token 开销）
    6. 过滤会话内已发现的工具（定义模块级 `discoveredToolsThisSession: Set<string>`，与 skill prefetch 的 `discoveredThisSession` 独立）
    7. 结果为空时返回 `[]`
    8. 记录 `logForDebugging` 日志
    9. 返回 `[buildToolDiscoveryAttachment(filteredResults, 'assistant_turn', queryText, durationMs, index.length)]`
    10. catch 块返回 `[]`（fire-and-forget，不向上传播错误）
  - 原因: 异步预取不阻塞主流程，与 skill prefetch 保持一致的错误处理策略（静默失败）

- [x] 实现 `getTurnZeroToolSearchPrefetch` 同步获取函数 — turn-0 场景，用户首次输入时阻塞式获取
  - 位置: `src/services/toolSearch/prefetch.ts`，在 `startToolSearchPrefetch` 之后
  - 函数签名:
    ```typescript
    export async function getTurnZeroToolSearchPrefetch(
      input: string,
      tools: Tool[],
    ): Promise<Attachment | null>
    ```
  - 核心逻辑（参照 `skillSearch/prefetch.ts:getTurnZeroSkillDiscovery` L308-356 的模式）:
    1. `input` 为空时返回 `null`
    2. 记录 `startedAt = Date.now()`
    3. 调用 `getToolIndex(tools)` 获取工具索引
    4. 调用 `searchTools(input, index, 3)` 搜索 top-3 工具
    5. 结果为空时返回 `null`
    6. 将结果工具名加入 `discoveredToolsThisSession`
    7. 记录 `logForDebugging` 日志
    8. 返回 `buildToolDiscoveryAttachment(results, 'user_input', input, durationMs, index.length)`
    9. catch 块返回 `null`
  - 原因: turn-0 是唯一的阻塞式入口，因为此时没有其他计算可以隐藏预取延迟。与 skill prefetch 保持一致的设计

- [x] 实现 `collectToolSearchPrefetch` 结果收集函数 — 等待异步预取完成并收集结果
  - 位置: `src/services/toolSearch/prefetch.ts`，在 `getTurnZeroToolSearchPrefetch` 之后
  - 函数签名:
    ```typescript
    export async function collectToolSearchPrefetch(
      pending: Promise<Attachment[]>,
    ): Promise<Attachment[]>
    ```
  - 核心逻辑（与 `skillSearch/prefetch.ts:collectSkillDiscoveryPrefetch` L298-306 完全一致）:
    ```typescript
    try {
      return await pending
    } catch {
      return []
    }
    ```
  - 原因: 包装 Promise，确保预取失败时返回空数组而非抛出异常

- [x] 在 `src/utils/attachments.ts` 中注册 `tool_discovery` attachment type — 扩展 Attachment 联合类型
  - 位置: `src/utils/attachments.ts` 的 `Attachment` 类型定义中，在 `skill_discovery` 类型分支（L534-L555）之后
  - 新增 import（文件顶部 import 区域）:
    ```typescript
    import type { ToolDiscoveryResult } from '../services/toolSearch/prefetch.js'
    ```
  - 在 `skill_discovery` 分支后追加 `tool_discovery` 类型:
    ```typescript
    | {
        type: 'tool_discovery'
        tools: ToolDiscoveryResult[]
        trigger: 'assistant_turn' | 'user_input'
        queryText: string
        durationMs: number
        indexSize: number
      }
    ```
  - 原因: `createAttachmentMessage` 接收 `Attachment` 类型参数，必须将 `tool_discovery` 注册到联合类型中才能通过类型检查

- [x] 在 `src/utils/attachments.ts` 中集成 turn-0 工具预取 — 在 skill discovery 附件之后添加 tool discovery 附件
  - 位置: `src/utils/attachments.ts` 的 `getAttachmentMessages` 函数中，在 skill discovery 的 `maybe('skill_discovery', ...)` 调用块（L818-L831）之后
  - 新增条件 require 模块（与 `skillSearchModules` 模式一致，在文件顶部 ~L92 `skillSearchModules` 定义之后）:
    ```typescript
    const toolSearchModules = feature('EXPERIMENTAL_TOOL_SEARCH')
      ? {
          prefetch:
            require('../services/toolSearch/prefetch.js') as typeof import('../services/toolSearch/prefetch.js'),
        }
      : null
    ```
  - 在 skill discovery 的 spread 数组中追加 tool discovery 附件（在 `]` 闭合 `maybe('skill_discovery', ...)` 之后，在外层 spread `...(feature('EXPERIMENTAL_SKILL_SEARCH') &&` 的 `]` 之前）:
    ```typescript
    ...(feature('EXPERIMENTAL_TOOL_SEARCH') &&
    toolSearchModules &&
    !options?.skipSkillDiscovery
      ? [
          maybe('tool_discovery', async () => {
            if (suppressNextDiscovery) {
              return []
            }
            const result =
              await toolSearchModules.prefetch.getTurnZeroToolSearchPrefetch(
                input,
                context.options.tools ?? [],
              )
            return result ? [result] : []
          }),
        ]
      : []),
    ```
  - 注意: `suppressNextDiscovery` 与 skill discovery 共用同一个标志（skill expansion 路径不应触发工具发现，语义一致）
  - 原因: turn-0 预取与 skill discovery 共享同一集成点（`getAttachmentMessages`），两者互不干扰，各自生成独立 attachment

- [x] 在 `src/query.ts` 中集成 inter-turn 工具预取触发 — 在 skill prefetch 之后异步启动工具预取
  - 位置: `src/query.ts` 文件顶部 conditional require 区域（~L68-70 `skillPrefetch` 定义之后）
  - 新增 conditional require:
    ```typescript
    const toolSearchPrefetch = feature('EXPERIMENTAL_TOOL_SEARCH')
      ? (require('./services/toolSearch/prefetch.js') as typeof import('./services/toolSearch/prefetch.js'))
      : null
    ```
  - 位置: `src/query.ts` 的 `queryLoop` 函数中，在 `pendingSkillPrefetch` 定义（L480-484）之后
  - 新增工具预取触发:
    ```typescript
    const pendingToolPrefetch = toolSearchPrefetch?.startToolSearchPrefetch(
      state.tools ?? [],
      messages,
    )
    ```
  - 原因: 与 skill prefetch 保持相同的触发时机（每轮迭代开始时异步启动），两者并行执行互不阻塞

- [x] 在 `src/query.ts` 中集成工具预取结果消费 — 在 skill prefetch 收集之后收集工具预取结果
  - 位置: `src/query.ts` 的 `queryLoop` 函数中，在 skill prefetch 结果消费块（L1910-L1918）之后
  - 新增工具预取结果消费:
    ```typescript
    if (toolSearchPrefetch && pendingToolPrefetch) {
      const toolAttachments =
        await toolSearchPrefetch.collectToolSearchPrefetch(pendingToolPrefetch)
      for (const att of toolAttachments) {
        const msg = createAttachmentMessage(att)
        yield msg
        toolResults.push(msg)
      }
    }
    ```
  - 原因: 与 skill prefetch 结果消费保持一致的位置和模式（post-tools 阶段注入），确保预取结果在本轮工具执行完成后、下一轮模型调用前注入

- [x] 为 `prefetch.ts` 核心逻辑编写单元测试
  - 测试文件: `src/services/toolSearch/__tests__/prefetch.test.ts`（新建）
  - 测试框架: `bun:test`
  - 测试场景:
    - `startToolSearchPrefetch` — 正常调用: 构造 mock Tool 数组和 mock messages，mock `getToolIndex` 返回固定索引，mock `searchTools` 返回匹配结果，验证返回的 `Attachment[]` 包含 `type: 'tool_discovery'` 且 `tools` 非空、`trigger` 为 `'assistant_turn'`
    - `startToolSearchPrefetch` — 空查询: messages 中无用户文本内容，验证返回空数组
    - `startToolSearchPrefetch` — 无匹配: `searchTools` 返回空数组，验证返回空数组
    - `startToolSearchPrefetch` — 异常安全: mock `getToolIndex` 抛出异常，验证返回空数组（不抛出）
    - `startToolSearchPrefetch` — 会话去重: 连续两次调用传入相同工具名，第二次返回空数组（已被 `discoveredToolsThisSession` 过滤）
    - `getTurnZeroToolSearchPrefetch` — 正常调用: 传入有效 input 和 mock tools，验证返回非 null 的 `Attachment`，`trigger` 为 `'user_input'`
    - `getTurnZeroToolSearchPrefetch` — 空输入: 传入空字符串，验证返回 null
    - `getTurnZeroToolSearchPrefetch` — 无匹配: `searchTools` 返回空数组，验证返回 null
    - `collectToolSearchPrefetch` — 正常收集: 传入 resolved promise，验证返回对应 attachment 数组
    - `collectToolSearchPrefetch` — 异常安全: 传入 rejected promise，验证返回空数组
    - `buildToolDiscoveryAttachment` — 返回的 attachment 对象包含 `type: 'tool_discovery'`、`tools`、`trigger`、`queryText`、`durationMs`、`indexSize` 字段
  - Mock 策略: 使用 `bun:test` 的 `mock` 函数 mock `./toolIndex.js` 的 `getToolIndex` 和 `searchTools`；构造 `Partial<Tool>` 类型的 mock Tool 对象；构造包含 `{ type: 'user', content: 'test query' }` 的 mock Message 数组
  - 运行命令: `bun test src/services/toolSearch/__tests__/prefetch.test.ts`
  - 预期: 所有测试通过

**检查步骤:**

- [x] 验证 `prefetch.ts` 文件存在且导出正确
  - `grep -c "export async function\|export type" src/services/toolSearch/prefetch.ts`
  - 预期: 至少 5（startToolSearchPrefetch, getTurnZeroToolSearchPrefetch, collectToolSearchPrefetch, ToolDiscoveryResult, extractQueryFromMessages import）

- [x] 验证 `tool_discovery` 类型已注册到 Attachment 联合类型
  - `grep -n "tool_discovery" src/utils/attachments.ts`
  - 预期: 至少 2 行（类型定义 + maybe 调用）

- [x] 验证 `query.ts` 中工具预取触发和消费代码已添加
  - `grep -n "toolSearchPrefetch\|pendingToolPrefetch\|collectToolSearchPrefetch" src/query.ts`
  - 预期: 至少 6 行（conditional require + start 调用 + if + collect 调用 + yield）

- [x] 验证 `attachments.ts` 中 turn-0 工具预取已集成
  - `grep -n "getTurnZeroToolSearchPrefetch\|toolSearchModules" src/utils/attachments.ts`
  - 预期: 至少 3 行（conditional require + getTurnZero 调用 + toolSearchModules 使用）

- [x] 验证 TypeScript 编译无错误
  - `bunx tsc --noEmit --pretty 2>&1 | head -30`
  - 预期: 无新增类型错误

- [x] 验证单元测试通过
  - `bun test src/services/toolSearch/__tests__/prefetch.test.ts 2>&1 | tail -10`
  - 预期: 输出包含 "pass" 且无 "fail"

**认知变更:**
- [x] [CLAUDE.md] `src/services/toolSearch/prefetch.ts` 的 `extractQueryFromMessages` 复用了 `src/services/skillSearch/prefetch.ts` 的同名导出函数。修改 `skillSearch/prefetch.ts` 的 `extractQueryFromMessages` 时需同步检查工具预取的行为。工具预取使用独立的 `discoveredToolsThisSession` Set，与 skill prefetch 的去重集合互不影响。

---

### Task 7: 用户推荐 UI

**背景:**
[业务语境] — 在 REPL 输入区域上方渲染工具推荐提示条，帮助用户了解哪些工具适合当前任务，提升工具发现体验
[修改原因] — 当前缺少面向用户的工具推荐可视化，预取管道（Task 6）产出的匹配结果无法被用户感知
[上下游影响] — 本 Task 消费 Task 6 `collectToolSearchPrefetch()` 的预取结果数据；本 Task 的组件挂载到 REPL.tsx 的对话框优先级系统中

**涉及文件:**
- 新建: `src/components/ToolSearchHint.tsx`
- 新建: `src/components/__tests__/ToolSearchHint.test.ts`
- 修改: `src/screens/REPL.tsx`

**执行步骤:**
- [x] 新建 `src/components/ToolSearchHint.tsx` — Ink 组件，渲染工具推荐提示条
  - 位置: 新建文件，参照 `src/components/ClaudeCodeHint/PluginHintMenu.tsx` 的结构模式
  - 组件签名:
    ```typescript
    type ToolSearchHintItem = {
      name: string;
      description: string;
      score: number;
    };
    type Props = {
      tools: ToolSearchHintItem[];
      onSelect: (toolName: string) => void;
      onDismiss: () => void;
    };
    export function ToolSearchHint({ tools, onSelect, onDismiss }: Props): React.ReactNode;
    ```
  - 使用 `PermissionDialog`（从 `src/components/permissions/PermissionDialog.js`）作为外层容器，title 设为 `"Tool Recommendation"`
  - 使用 `Select`（从 `src/components/CustomSelect/select.js`）渲染可选工具列表，每个选项格式为: `<工具名> — <描述截断至 60 字符> (score: 0.XX)`
  - 额外增加一个 "Dismiss" 选项（value: `'dismiss'`），排在选项列表末尾
  - `onSelect` 回调: 当用户选中某个工具时调用 `onDismiss()` 清除推荐，并调用 `onSelect(toolName)` 将工具名传递给 REPL 层追加到用户消息上下文
  - 30 秒自动 dismiss（复用 `PluginHintMenu` 的 `AUTO_DISMISS_MS = 30_000` 模式），通过 `setTimeout` + `useRef` 实现，超时调用 `onDismiss()`
  - `useEffect` 清理函数中 `clearTimeout` 防止内存泄漏
  - 原因: 遵循现有 UI 提示集成模式（PluginHintMenu），保证交互风格一致

- [x] 新建 `src/hooks/useToolSearchHint.ts` — 自定义 Hook，管理工具推荐状态与生命周期
  - 位置: 新建文件，参照 `src/hooks/useClaudeCodeHintRecommendation.tsx` 的状态管理模式
  - Hook 签名:
    ```typescript
    type ToolSearchHintResult = {
      tools: ToolSearchHintItem[];
      visible: boolean;
      handleSelect: (toolName: string) => void;
      handleDismiss: () => void;
    };
    export function useToolSearchHint(): ToolSearchHintResult;
    ```
  - 内部使用 `React.useSyncExternalStore` 订阅预取结果（从 Task 6 的 `src/services/toolSearch/prefetch.ts` 中导出的模块级缓存），subscribe 函数和 getSnapshot 函数从 prefetch 模块获取
  - `tools` 字段: 从预取结果中提取前 3 个工具，每个工具包含 `name`、`description`（截断至 60 字符）、`score`
  - `visible` 字段: 当 `tools` 非空且最高 score >= 0.15 时为 true
  - `handleSelect`: 记录用户选择（analytics 事件 `tengu_tool_search_hint_select`），然后清除推荐状态
  - `handleDismiss`: 记录 dismiss 事件（analytics 事件 `tengu_tool_search_hint_dismiss`），清除推荐状态
  - 清除推荐状态时调用 prefetch 模块的清除函数（`clearToolSearchPrefetchResults()`，由 Task 6 提供）
  - 原因: 将状态管理与 UI 渲染解耦，遵循现有 hook 模式（useClaudeCodeHintRecommendation）

- [x] 修改 `src/screens/REPL.tsx` — 集成 ToolSearchHint 组件到对话框优先级系统
  - 位置: `getFocusedInputDialog()` 函数（~L2377），在返回类型联合中新增 `'tool-search-hint'`
  - 在 `getFocusedInputDialog()` 函数体中，在 `plugin-hint` 判断（~L2446）之后、`desktop-upsell` 判断（~L2449）之前，新增一个优先级分支:
    ```typescript
    if (allowDialogsWithAnimation && toolSearchHint.visible) return 'tool-search-hint';
    ```
  - 位置: 文件顶部 import 区域（~L448，`PluginHintMenu` import 附近），新增 import:
    ```typescript
    import { ToolSearchHint } from '../components/ToolSearchHint.js';
    import { useToolSearchHint } from '../hooks/useToolSearchHint.js';
    ```
  - 位置: hook 调用区域（~L1038，`useClaudeCodeHintRecommendation` 调用之后），新增:
    ```typescript
    const toolSearchHint = useToolSearchHint();
    ```
  - 位置: JSX 渲染区域（~L6174，`PluginHintMenu` 渲染块之后），新增条件渲染块:
    ```tsx
    {focusedInputDialog === 'tool-search-hint' && toolSearchHint.visible && (
      <ToolSearchHint
        tools={toolSearchHint.tools}
        onSelect={toolSearchHint.handleSelect}
        onDismiss={toolSearchHint.handleDismiss}
      />
    )}
    ```
  - 原因: 遵循 REPL 的 focusedInputDialog 优先级系统，确保工具推荐提示在合适的时机显示，不阻塞高优先级对话框

- [x] 为 `ToolSearchHint` 组件和 `useToolSearchHint` hook 编写单元测试
  - 测试文件: `src/components/__tests__/ToolSearchHint.test.ts`
  - 测试场景:
    - 当 `tools` 数组为空时，`useToolSearchHint` 返回 `visible: false`
    - 当 `tools` 数组非空且最高 score >= 0.15 时，`useToolSearchHint` 返回 `visible: true` 且 `tools` 包含最多 3 个条目
    - 当最高 score < 0.15 时，`useToolSearchHint` 返回 `visible: false`
    - `handleDismiss` 调用后推荐状态被清除
    - `handleSelect` 调用后推荐状态被清除且回调被触发
  - 使用 `bun:test` 框架（与项目现有测试一致）
  - 运行命令: `bun test src/components/__tests__/ToolSearchHint.test.ts`
  - 预期: 所有测试通过

**检查步骤:**
- [x] 验证新文件已创建且导出正确
  - `grep -c "export function ToolSearchHint" src/components/ToolSearchHint.tsx && grep -c "export function useToolSearchHint" src/hooks/useToolSearchHint.ts`
  - 预期: 两个 grep 均返回 1
- [x] 验证 REPL.tsx 集成正确
  - `grep -c "ToolSearchHint" src/screens/REPL.tsx && grep -c "tool-search-hint" src/screens/REPL.tsx`
  - 预期: 两个 grep 均返回值 >= 2（import + hook + 渲染 + 优先级判断）
- [x] 验证 TypeScript 编译无错误
  - `npx tsc --noEmit --pretty 2>&1 | grep -E "ToolSearchHint|useToolSearchHint" | head -5`
  - 预期: 无输出（无相关类型错误）
- [x] 验证单元测试通过
  - `bun test src/components/__tests__/ToolSearchHint.test.ts`
  - 预期: 所有测试通过，无失败
---

---

### Task 8: 全功能验收

**前置条件:**
- Plan 1（Task 1-4）和 Plan 2（Task 5-7）全部完成
- `bun run build` 可用

**端到端验证:**

1. 运行完整测试套件确保无回归
   - `bun test 2>&1 | tail -20`
   - 预期: 全部测试通过（包含 Plan 1 和 Plan 2 新增的所有测试文件）
   - 失败排查: 检查对应 Task 的测试步骤，确认 mock 配置和 import 路径

2. 运行 precheck 确保 typecheck + lint + test 全部通过
   - `bun run precheck 2>&1 | tail -20`
   - 预期: 零错误通过
   - 失败排查: 类型错误检查 import 路径；lint 错误检查格式；测试失败检查对应 Task

3. 验证系统提示词引导文本正确注入
   - `bun run dev -- --dump-system-prompt 2>&1 | grep -A5 "ToolSearch"`
   - 预期: 输出包含 "use ToolSearch to discover" 引导文本
   - 失败排查: 检查 Task 5 的 prompts.ts 修改

4. 验证 ExecuteTool 在工具列表中可见
   - `bun run dev -- --dump-system-prompt 2>&1 | grep "ExecuteTool"`
   - 预期: 输出包含 ExecuteTool 工具定义
   - 失败排查: 检查 Task 5 的 tools.ts 注册

5. 验证构建产物正确
   - `bun run build 2>&1 | tail -5`
   - 预期: 构建成功，输出 dist/cli.js
   - 失败排查: 检查新增文件的 import 是否兼容 Bun.build splitting

6. 验证延迟工具数量正确
   - `grep -c "isDeferredTool" src/utils/toolSearch.ts src/services/api/claude.ts packages/builtin-tools/src/tools/ToolSearchTool/ToolSearchTool.ts 2>/dev/null`
   - 预期: 所有调用点仍在使用 isDeferredTool（已被 Task 1 重构为白名单制）
   - 失败排查: 检查 Task 1 的 isDeferredTool 重构
