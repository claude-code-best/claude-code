# Tool Search 执行计划（一）— 基础设施层

**目标:** 建立 tool search 的基础能力——核心工具常量、TF-IDF 工具索引、ExecuteTool 执行工具、ToolSearchTool 搜索增强

**技术栈:** TypeScript, Bun, Zod, TF-IDF (复用 localSearch.ts), buildTool 框架

**设计文档:** spec/feature_20260508_F001_tool-search/spec-design.md

## 改动总览

- 新增 `CORE_TOOLS` 常量集合（31 个核心工具名）到 `src/constants/tools.ts`，重构 `isDeferredTool` 为白名单制；新建 TF-IDF 工具索引 `toolIndex.ts`（复用 `localSearch.ts` 算法）；新建 `ExecuteTool` 工具包（3 个文件）；增强 `ToolSearchTool` 搜索层（TF-IDF + discover 模式）
- Task 1（CORE_TOOLS）是 Task 2/3/4 的共同前置依赖；Task 2（toolIndex）被 Task 4（搜索增强）依赖
- 关键决策：`isDeferredTool` 从"排除例外"改为"包含准入"白名单制，所有非核心工具默认延迟；TF-IDF 算法直接 import `localSearch.ts` 的导出函数，不创建独立共享模块

---

### Task 0: 环境准备

**背景:**
确保构建和测试工具链在当前开发环境中可用，避免后续 Task 因环境问题阻塞。

**执行步骤:**
- [x] 验证 Bun 运行时可用
  - `bun --version`
  - 预期: 输出 Bun 版本号
- [x] 验证 TypeScript 编译可用
  - `bunx tsc --noEmit --pretty 2>&1 | tail -5`
  - 预期: 无新增类型错误（已有错误可忽略）
- [x] 验证测试框架可用
  - `bun test --help 2>&1 | head -3`
  - 预期: 输出 bun test 帮助信息

**检查步骤:**
- [x] 构建命令执行成功
  - `bun run build 2>&1 | tail -10`
  - 预期: 构建成功，输出 dist/cli.js
- [x] 现有测试可通过
  - `bun test src/constants/__tests__/ 2>&1 | tail -5 || echo "no existing tests in this dir"`
  - 预期: 测试框架可用，无配置错误

---

### Task 1: 核心工具常量与延迟判定

**背景:**
当前 `isDeferredTool` 使用一组分散的特判规则（`shouldDefer`、MCP 检测、feature flag 特判）来决定工具是否延迟加载，缺少统一的"核心工具"概念。设计文档要求引入 `CORE_TOOLS` 白名单常量，将始终加载的核心工具（31 个）显式列出，并将 `isDeferredTool` 改为白名单制判定：核心工具 + alwaysLoad 工具 + ToolSearchTool/ExecuteTool 不延迟，其余全部延迟。本 Task 的输出（`CORE_TOOLS` 常量和重构后的 `isDeferredTool`）被 Task 2（TF-IDF 工具索引）、Task 3（ExecuteTool）、Task 4（ToolSearchTool 搜索增强）直接依赖。

**涉及文件:**
- 修改: `src/constants/tools.ts`
- 修改: `packages/builtin-tools/src/tools/ToolSearchTool/prompt.ts`
- 新建: `src/constants/__tests__/tools.test.ts`

**执行步骤:**

- [x] 在 `src/constants/tools.ts` 中新增 `CORE_TOOLS` 常量集合
  - 位置: `src/constants/tools.ts` 文件末尾（`COORDINATOR_MODE_ALLOWED_TOOLS` 之后，~L113）
  - 新增以下 import（文件顶部 import 区域，与现有 import 风格一致）:
    ```typescript
    import { SLEEP_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/SleepTool/prompt.js'
    import { LSP_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/LSPTool/prompt.js'
    import { VERIFY_PLAN_EXECUTION_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/VerifyPlanExecutionTool/constants.js'
    import { TEAM_CREATE_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/TeamCreateTool/constants.js'
    import { TEAM_DELETE_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/TeamDeleteTool/constants.js'
    ```
  - 在文件末尾新增 `CORE_TOOLS` 导出常量:
    ```typescript
    /**
     * Core tools that are always loaded with full schema at initialization.
     * These tools are never deferred — they appear in the initial prompt.
     * All other tools (non-core built-in + all MCP tools) are deferred
     * and must be discovered via ToolSearchTool / ExecuteTool.
     */
    export const CORE_TOOLS = new Set([
      // File operations
      ...SHELL_TOOL_NAMES,    // 'Bash', 'Shell'
      FILE_READ_TOOL_NAME,    // 'Read'
      FILE_EDIT_TOOL_NAME,    // 'Edit'
      FILE_WRITE_TOOL_NAME,   // 'Write'
      GLOB_TOOL_NAME,         // 'Glob'
      GREP_TOOL_NAME,         // 'Grep'
      NOTEBOOK_EDIT_TOOL_NAME,// 'NotebookEdit'
      // Agent & interaction
      AGENT_TOOL_NAME,        // 'Agent'
      ASK_USER_QUESTION_TOOL_NAME, // 'AskUserQuestion'
      SEND_MESSAGE_TOOL_NAME, // 'SendMessage'
      // Team (swarm)
      TEAM_CREATE_TOOL_NAME,  // 'TeamCreate'
      TEAM_DELETE_TOOL_NAME,  // 'TeamDelete'
      // Task management
      TASK_OUTPUT_TOOL_NAME,  // 'TaskOutput'
      TASK_STOP_TOOL_NAME,    // 'TaskStop'
      TASK_CREATE_TOOL_NAME,  // 'TaskCreate'
      TASK_GET_TOOL_NAME,     // 'TaskGet'
      TASK_LIST_TOOL_NAME,    // 'TaskList'
      TASK_UPDATE_TOOL_NAME,  // 'TaskUpdate'
      TODO_WRITE_TOOL_NAME,   // 'TodoWrite'
      // Planning
      ENTER_PLAN_MODE_TOOL_NAME,           // 'EnterPlanMode'
      EXIT_PLAN_MODE_V2_TOOL_NAME,         // 'ExitPlanMode'
      VERIFY_PLAN_EXECUTION_TOOL_NAME,     // 'VerifyPlanExecution'
      // Web
      WEB_FETCH_TOOL_NAME,   // 'WebFetch'
      WEB_SEARCH_TOOL_NAME,  // 'WebSearch'
      // Code intelligence
      LSP_TOOL_NAME,         // 'LSP'
      // Skills
      SKILL_TOOL_NAME,       // 'Skill'
      // Scheduling & monitoring
      SLEEP_TOOL_NAME,       // 'Sleep'
      // Tool discovery (always loaded)
      TOOL_SEARCH_TOOL_NAME, // 'ToolSearch'
      SYNTHETIC_OUTPUT_TOOL_NAME, // 'SyntheticOutput'
    ]) as ReadonlySet<string>
    ```
  - 说明: `ListPeers` 和 `Monitor` 工具名在各自工具文件内以局部常量定义（非 export），无法在 `tools.ts` 中 import。`ListPeers` 频率较低，`Monitor` 受 `MONITOR_TOOL` feature gate 控制，两者暂不纳入 CORE_TOOLS，待后续 Task 按需加入。
  - 原因: 建立统一的"核心工具"白名单，为后续 Task 的延迟判定、工具索引排除提供单一数据源

- [x] 重构 `packages/builtin-tools/src/tools/ToolSearchTool/prompt.ts` 中的 `isDeferredTool` 函数
  - 位置: `packages/builtin-tools/src/tools/ToolSearchTool/prompt.ts` 的 `isDeferredTool` 函数体（L62-L108）
  - 新增 import（文件顶部）:
    ```typescript
    import { CORE_TOOLS } from 'src/constants/tools.js'
    ```
  - 替换整个 `isDeferredTool` 函数体为白名单制逻辑:
    ```typescript
    export function isDeferredTool(tool: Tool): boolean {
      // Explicit opt-out via _meta['anthropic/alwaysLoad']
      if (tool.alwaysLoad === true) return false

      // Core tools are always loaded — never deferred
      if (CORE_TOOLS.has(tool.name)) return false

      // Everything else (non-core built-in + all MCP tools) is deferred
      return true
    }
    ```
  - 清理 isDeferredTool 不再需要的代码:
    - 文件顶部的 `import { feature } from 'bun:bundle'`（仅被 isDeferredTool 使用的 feature flag 逻辑）
    - 文件顶部的 `import { isReplBridgeActive } from 'src/bootstrap/state.js'`（仅被 KAIROS 逻辑使用）
    - 保留 `import { getFeatureValue_CACHED_MAY_BE_STALE } from 'src/services/analytics/growthbook.js'`（仍被 `getToolLocationHint()` 使用，不删除）
    - 文件顶部的 `import { AGENT_TOOL_NAME } from '../AgentTool/constants.js'`（不再被 isDeferredTool 使用）
    - L8-L21 的 `BRIEF_TOOL_NAME` 和 `SEND_USER_FILE_TOOL_NAME` 条件 import 块（`isDeferredTool` 不再需要 feature flag 特判）
  - 注意: 保留 `getToolLocationHint()` 函数及其对 `getFeatureValue_CACHED_MAY_BE_STALE` 的 import（仍被 `getPrompt()` 使用）
  - 原因: 白名单制替代分散的特判规则，逻辑从"排除例外"变为"包含准入"，更易维护和扩展

- [x] 为 `CORE_TOOLS` 常量和 `isDeferredTool` 重构编写单元测试
  - 测试文件: `src/constants/__tests__/tools.test.ts`（新建）
  - 测试场景:
    - `CORE_TOOLS` 包含预期数量的工具（约 29 个: 7 SHELL_TOOL_NAMES + 22 独立工具名）
    - `CORE_TOOLS` 包含所有设计文档中列出的核心工具名（抽查: 'Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep', 'Agent', 'AskUserQuestion', 'ToolSearch', 'WebSearch', 'WebFetch', 'Sleep', 'LSP', 'Skill', 'TeamCreate', 'TeamDelete', 'TaskCreate', 'TaskGet', 'TaskUpdate', 'TaskList', 'TaskOutput', 'TaskStop', 'TodoWrite', 'EnterPlanMode', 'ExitPlanMode', 'VerifyPlanExecution', 'NotebookEdit', 'SyntheticOutput'）
    - `CORE_TOOLS` 是 ReadonlySet，不可外部修改
    - `isDeferredTool` 对 `CORE_TOOLS` 中的工具名返回 `false`（构造 `{ name: 'Read', alwaysLoad: undefined, isMcp: false, shouldDefer: undefined }` 形式的 mock Tool）
    - `isDeferredTool` 对 `alwaysLoad: true` 的工具返回 `false`（即使工具名不在 CORE_TOOLS 中）
    - `isDeferredTool` 对非核心内置工具返回 `true`（工具名 'ConfigTool'，无 alwaysLoad，无 isMcp）
    - `isDeferredTool` 对 MCP 工具返回 `true`（`isMcp: true`，即使 alwaysLoad 为 undefined）
    - `isDeferredTool` 对 `alwaysLoad: true` 的 MCP 工具返回 `false`（alwaysLoad 优先级最高）
  - 运行命令: `bun test src/constants/__tests__/tools.test.ts`
  - 预期: 所有测试通过

**检查步骤:**

- [x] 验证 `CORE_TOOLS` 常量已导出且包含预期工具
  - `grep -c "CORE_TOOLS" src/constants/tools.ts`
  - 预期: 至少 2 行（export 定义 + 注释）

- [x] 验证 `isDeferredTool` 函数已简化为白名单制
  - `grep -A 8 "export function isDeferredTool" packages/builtin-tools/src/tools/ToolSearchTool/prompt.ts`
  - 预期: 函数体仅包含 `alwaysLoad`、`CORE_TOOLS.has`、`return true` 三个分支，不包含 `isMcp`、`feature(`、`shouldDefer` 等旧逻辑

- [x] 验证 `isDeferredTool` 不再依赖已删除的 import
  - `grep "feature(" packages/builtin-tools/src/tools/ToolSearchTool/prompt.ts`
  - 预期: 无输出（feature flag 依赖已从 isDeferredTool 中移除）

- [x] 验证类型检查通过
  - `bunx tsc --noEmit --pretty 2>&1 | head -30`
  - 预期: 无新增类型错误

- [x] 运行新增单元测试
  - `bun test src/constants/__tests__/tools.test.ts`
  - 预期: 所有测试通过

---

### Task 2: TF-IDF 工具索引

**背景:**
[业务语境] — 本 Task 构建工具索引模块，为 TF-IDF 搜索提供索引构建和查询能力。ToolSearchTool（Task 4）和预取管道依赖此索引来按任务描述发现延迟工具。
[修改原因] — 当前项目只有 skill 搜索的 TF-IDF 实现（`localSearch.ts`），缺少工具维度的索引。`localSearch.ts` 中的 `computeWeightedTf`、`computeIdf`、`cosineSimilarity` 三个核心函数未导出，需要先导出才能复用。
[上下游影响] — 本 Task 输出 `toolIndex.ts` 被 Task 4（ToolSearchTool 搜索增强）和 Task 3（ExecuteTool 工具查找）依赖。本 Task 依赖 Task 1（`CORE_TOOLS` 常量和 `isDeferredTool` 判定）。

**涉及文件:**
- 修改: `src/services/skillSearch/localSearch.ts`（导出三个私有函数）
- 新建: `src/services/toolSearch/toolIndex.ts`
- 新建: `src/services/toolSearch/__tests__/toolIndex.test.ts`

**执行步骤:**

- [x] 导出 `localSearch.ts` 中三个私有 TF-IDF 函数 — `toolIndex.ts` 需要复用这些算法函数
  - 位置: `src/services/skillSearch/localSearch.ts` L212, L230, L249
  - 在 `computeWeightedTf`、`computeIdf`、`cosineSimilarity` 三个函数声明前各加 `export` 关键字
  - 保持函数签名不变，仅增加导出修饰符
  - 原因: 这三个函数是 TF-IDF 核心算法，与索引结构无关，导出后 skill 和 tool 两个索引模块均可复用

- [x] 新建 `src/services/toolSearch/toolIndex.ts`，定义 `ToolIndexEntry` 接口和工具字段权重常量
  - 位置: 文件开头
  - 定义 `ToolIndexEntry` 接口，包含以下字段：
    ```typescript
    export interface ToolIndexEntry {
      name: string
      normalizedName: string
      description: string
      searchHint: string | undefined
      isMcp: boolean
      isDeferred: boolean
      inputSchema: object | undefined
      tokens: string[]
      tfVector: Map<string, number>
    }
    ```
  - 定义字段权重常量（参照 `localSearch.ts` 的 `FIELD_WEIGHT` 模式）：
    ```typescript
    const TOOL_FIELD_WEIGHT = {
      name: 3.0,
      searchHint: 2.5,
      description: 1.0,
    } as const
    ```
  - 定义最小显示分数常量：`const TOOL_SEARCH_DISPLAY_MIN_SCORE = Number(process.env.TOOL_SEARCH_DISPLAY_MIN_SCORE ?? '0.10')`
  - 原因: 工具索引结构与 skill 索引不同（无 `whenToUse`/`allowedTools`，增加 `searchHint`/`isMcp`/`isDeferred`/`inputSchema`），需独立定义

- [x] 实现 `parseToolName` 工具名解析函数 — 将工具名拆分为可搜索的 token 列表
  - 位置: `src/services/toolSearch/toolIndex.ts`，在接口定义之后
  - 从 `ToolSearchTool.ts:132-161` 的 `parseToolName` 逻辑提取并适配为独立函数：
    ```typescript
    export function parseToolName(name: string): { parts: string[]; full: string; isMcp: boolean }
    ```
  - MCP 工具（`mcp__` 前缀）: 去掉前缀后按 `__` 和 `_` 拆分，结果示例 `mcp__github__create_issue` → `["github", "create", "issue"]`
  - 内置工具: CamelCase 拆分 + 下划线拆分，结果示例 `NotebookEditTool` → `["notebook", "edit", "tool"]`
  - 原因: 工具名是搜索的高权重信号，需要拆分为有意义的关键词 token

- [x] 实现 `buildToolIndex` 索引构建函数 — 从 `Tool[]` 数组构建完整的 TF-IDF 索引
  - 位置: `src/services/toolSearch/toolIndex.ts`，在 `parseToolName` 之后
  - 函数签名：`export async function buildToolIndex(tools: Tool[]): Promise<ToolIndexEntry[]>`
  - 导入依赖：从 `localSearch.ts` 导入 `tokenizeAndStem`、`computeWeightedTf`、`computeIdf`、`cosineSimilarity`
  - 核心逻辑：
    1. 过滤出延迟工具（调用 `isDeferredTool`，从 `@claude-code-best/builtin-tools/tools/ToolSearchTool/prompt.js` 导入）
    2. 对每个延迟工具，调用 `tool.prompt()` 获取描述文本（构造一个 mock 的 `getToolPermissionContext` 返回空权限上下文，`tools` 传原始工具列表，`agents` 传空数组）
    3. 调用 `parseToolName(tool.name)` 获取工具名 token
    4. 调用 `tokenizeAndStem` 对 `name parts`、`searchHint`、`description` 分别分词
    5. 调用 `computeWeightedTf` 按权重计算 TF 向量
    6. 读取 `tool.inputJSONSchema ?? (tool.inputSchema ? zodToJsonSchema(tool.inputSchema) : undefined)` 作为 `inputSchema`
    7. 组装 `ToolIndexEntry` 条目
    8. 对全部条目调用 `computeIdf` 计算 IDF，将 TF 向量乘以 IDF 得到最终 TF-IDF 向量
  - 返回构建好的索引数组
  - 原因: 索引构建是搜索的前提，需要从 Tool 对象提取文本并计算 TF-IDF 向量

- [x] 实现 `searchTools` 搜索函数 — 按任务描述查询最匹配的工具
  - 位置: `src/services/toolSearch/toolIndex.ts`，在 `buildToolIndex` 之后
  - 函数签名：`export function searchTools(query: string, index: ToolIndexEntry[], limit?: number): ToolSearchResult[]`
  - 定义返回类型：
    ```typescript
    export interface ToolSearchResult {
      name: string
      description: string
      searchHint: string | undefined
      score: number
      isMcp: boolean
      isDeferred: boolean
      inputSchema: object | undefined
    }
    ```
  - 核心逻辑（参照 `localSearch.ts:searchSkills` L383-443 的模式）：
    1. 对 query 调用 `tokenizeAndStem` 分词
    2. 计算 query 的 TF-IDF 向量（TF 归一化 + IDF 乘法）
    3. 对索引中每个条目计算 `cosineSimilarity(queryTfIdf, entry.tfVector)`
    4. CJK bigram 过滤：若 query 包含 CJK token 且匹配数 < 2 且无 ASCII 匹配，则分数置零（复用 `CJK_MIN_BIGRAM_MATCHES = 2` 常量）
    5. 工具名完全包含加分：若 query 小写化后包含工具的 `normalizedName`，分数取 `Math.max(score, 0.75)`
    6. 过滤 `score >= TOOL_SEARCH_DISPLAY_MIN_SCORE` 的结果
    7. 按分数降序排列，截取前 `limit` 条（默认 5）
  - 原因: 搜索函数是工具发现的核心入口，提供给 ToolSearchTool 和预取管道调用

- [x] 实现模块级索引缓存和增量更新 — 避免每次搜索都全量重建索引
  - 位置: `src/services/toolSearch/toolIndex.ts`，在 `searchTools` 之后
  - 定义模块级缓存变量：
    ```typescript
    let cachedIndex: ToolIndexEntry[] | null = null
    let cachedToolNames: string | null = null
    ```
  - 实现 `getToolIndex` 缓存包装函数：签名 `export async function getToolIndex(tools: Tool[]): Promise<ToolIndexEntry[]>`
    - 缓存 key 为延迟工具名排序后的字符串
    - 当工具名集合变化时（MCP 连接/断开），自动重建索引
    - 缓存未命中时调用 `buildToolIndex`
  - 实现 `clearToolIndexCache` 清除函数：签名 `export function clearToolIndexCache(): void`
  - 原因: 索引构建涉及异步 `tool.prompt()` 调用，缓存避免重复计算；增量更新通过比较工具名集合实现

- [x] 为 `toolIndex.ts` 核心逻辑编写单元测试
  - 测试文件: `src/services/toolSearch/__tests__/toolIndex.test.ts`
  - 测试框架: `bun:test`（与 `localSearch.test.ts` 一致）
  - 测试场景:
    - `parseToolName` — MCP 工具名 `mcp__github__create_issue` 拆分为 `["github", "create", "issue"]`，`isMcp: true`
    - `parseToolName` — 内置工具名 `NotebookEditTool` 拆分为 `["notebook", "edit", "tool"]`，`isMcp: false`
    - `buildToolIndex` — 传入包含延迟工具的 mock Tool 数组，返回正确数量的 `ToolIndexEntry`，每个条目的 `tokens` 非空、`tfVector` 非空
    - `searchTools` — 英文查询 `"schedule cron job"` 能匹配含 `searchHint: "schedule a recurring or one-shot prompt"` 的工具，返回分数 > 0 且排名第一
    - `searchTools` — CJK 查询能匹配含中文描述的工具（参照 `localSearch.test.ts` 的 CJK 测试模式）
    - `searchTools` — 空查询返回空数组
    - `searchTools` — 无匹配结果返回空数组
    - `getToolIndex` — 相同工具列表两次调用返回同一缓存引用
    - `clearToolIndexCache` — 调用后 `getToolIndex` 重新构建索引
  - Mock 构造: 创建 `Partial<Tool>` 类型的 mock 工具，设置 `name`、`searchHint`、`prompt()`（返回固定描述字符串）、`inputSchema`（mock Zod schema 或 undefined）、`isMcp`、`shouldDefer`、`alwaysLoad` 等字段
  - 运行命令: `bun test src/services/toolSearch/__tests__/toolIndex.test.ts`
  - 预期: 所有测试通过

**检查步骤:**
- [x] 验证 `localSearch.ts` 三个函数已导出
  - `grep -c "export function computeWeightedTf\|export function computeIdf\|export function cosineSimilarity" src/services/skillSearch/localSearch.ts`
  - 预期: 输出 3

- [x] 验证 `toolIndex.ts` 文件存在且导出正确
  - `grep -c "export function\|export interface\|export type" src/services/toolSearch/toolIndex.ts`
  - 预期: 至少 6（ToolIndexEntry, ToolSearchResult, parseToolName, buildToolIndex, searchTools, getToolIndex, clearToolIndexCache）

- [x] 验证 TypeScript 编译无错误
  - `bunx tsc --noEmit src/services/toolSearch/toolIndex.ts 2>&1 | head -20`
  - 预期: 无错误输出

- [x] 验证单元测试通过
  - `bun test src/services/toolSearch/__tests__/toolIndex.test.ts 2>&1 | tail -10`
  - 预期: 输出包含 "pass" 且无 "fail"

- [x] 验证 `localSearch.ts` 原有测试未回归
  - `bun test src/services/skillSearch/__tests__/localSearch.test.ts 2>&1 | tail -10`
  - 预期: 所有测试通过，无回归

**认知变更:**
- [x] [CLAUDE.md] `src/services/skillSearch/localSearch.ts` 中的 `computeWeightedTf`、`computeIdf`、`cosineSimilarity` 已导出，供 `toolIndex.ts` 复用。修改这些函数时需同步检查工具索引的测试
---
### Task 3: ExecuteTool 执行工具

**背景:**
[业务语境] — 新建 ExecuteTool 作为跨 API provider 的统一工具执行入口。当模型通过 ToolSearchTool 发现延迟工具后，使用 ExecuteTool 以 `tool_name` + `params` 的方式调用该工具，替代仅 Anthropic 支持的 `tool_reference` 机制。
[修改原因] — 当前项目无 ExecuteTool，延迟工具无法在非 Anthropic provider（OpenAI/Gemini/Grok）下被模型调用。
[上下游影响] — 本 Task 依赖 Task 1（`EXECUTE_TOOL_NAME` 常量、`CORE_TOOLS` 集合、`isDeferredTool` 判定）。本 Task 的输出（ExecuteTool 工具实例）被 Task 4（ToolSearchTool 搜索增强）和 `src/tools.ts`（工具注册）依赖。

**涉及文件:**
- 新建: `packages/builtin-tools/src/tools/ExecuteTool/constants.ts`
- 新建: `packages/builtin-tools/src/tools/ExecuteTool/prompt.ts`
- 新建: `packages/builtin-tools/src/tools/ExecuteTool/ExecuteTool.ts`
- 修改: `packages/builtin-tools/src/tools/ToolSearchTool/prompt.ts`（导入 `EXECUTE_TOOL_NAME`，在 `isDeferredTool` 中排除 ExecuteTool）
- 新建: `packages/builtin-tools/src/tools/ExecuteTool/__tests__/ExecuteTool.test.ts`

**执行步骤:**

- [x] 创建 ExecuteTool 常量文件
  - 位置: 新建 `packages/builtin-tools/src/tools/ExecuteTool/constants.ts`
  - 内容:
    ```typescript
    export const EXECUTE_TOOL_NAME = 'ExecuteTool'
    ```
  - 原因: 与 `ToolSearchTool/constants.ts` 中的 `TOOL_SEARCH_TOOL_NAME` 保持一致的模式，供 `isDeferredTool`、工具注册等处引用

- [x] 创建 ExecuteTool prompt 文件
  - 位置: 新建 `packages/builtin-tools/src/tools/ExecuteTool/prompt.ts`
  - 从 `./constants.js` 导入 `EXECUTE_TOOL_NAME`
  - 导出 `DESCRIPTION` 常量（一句话描述）和 `getPrompt()` 函数
  - `getPrompt()` 返回完整 prompt 文本，包含：
    - 功能说明：接受 `tool_name` + `params`，在全局工具注册表中查找目标工具并委托执行
    - 使用场景：当通过 ToolSearch 发现延迟工具后，使用此工具调用该工具
    - 输入说明：`tool_name` 是目标工具名称（如 "CronCreate"、"mcp__server__action"），`params` 是传递给目标工具的参数对象
    - 错误处理：工具不存在或参数无效时返回清晰的错误信息
  - 原因: 与 `ToolSearchTool/prompt.ts` 的 `getPrompt()` 模式保持一致，将 prompt 逻辑与工具实现分离

- [x] 创建 ExecuteTool 主实现文件
  - 位置: 新建 `packages/builtin-tools/src/tools/ExecuteTool/ExecuteTool.ts`
  - 依赖导入:
    - `z` from `zod/v4`
    - `buildTool`, `findToolByName`, `type Tool`, `type ToolDef`, `type ToolUseContext`, `type ToolResult` from `src/Tool.js`
    - `lazySchema` from `src/utils/lazySchema.js`
    - `DESCRIPTION`, `getPrompt`, `EXECUTE_TOOL_NAME` from `./prompt.js`
    - `EXECUTE_TOOL_NAME` from `./constants.js`
    - `isToolSearchEnabledOptimistic` from `src/utils/toolSearch.js`
  - 定义 `inputSchema`: `z.object({ tool_name: z.string().describe('...'), params: z.record(z.unknown()).describe('...') })`
  - 定义 `outputSchema`: `z.object({ result: z.unknown(), tool_name: z.string() })`
  - 使用 `buildTool` 构建 `ExecuteTool`，`satisfies ToolDef<InputSchema, OutputSchema>`
  - 关键属性:
    - `name: EXECUTE_TOOL_NAME`
    - `searchHint: 'execute run invoke call a deferred tool by name with parameters'`
    - `isConcurrencySafe() { return false }`（委托执行的工具是否并发安全取决于目标工具，保守设为 false）
    - `maxResultSizeChars: 100_000`（与 ToolSearchTool 和 MCPTool 一致）
    - `description()` 返回 `DESCRIPTION`
    - `prompt()` 返回 `getPrompt()`
  - `call(input, context)` 核心逻辑:
    1. 从 `context.options.tools` 中通过 `findToolByName(tools, input.tool_name)` 查找目标工具
    2. 目标工具不存在时，返回 `{ data: { result: null, tool_name: input.tool_name }, newMessages: [错误提示 user message] }`，错误信息格式：`Tool "${input.tool_name}" not found. Use ToolSearch to discover available tools.`
    3. 目标工具存在时，调用 `targetTool.checkPermissions(input.params as any, context)` 获取权限结果
    4. 权限检查结果为 `behavior: 'deny'` 时，返回权限拒绝信息
    5. 权限检查通过后，调用 `targetTool.call(input.params as any, context, ...)` 委托执行，透传 context、canUseTool、parentMessage、onProgress 参数（`call` 签名为 `call(args, context, canUseTool, parentMessage, onProgress?)`，从 ExecuteTool 自身的 `call` 参数中获取后三个参数并传递给目标工具）
    6. 返回目标工具的执行结果，附加 `tool_name` 字段用于追踪
  - `checkPermissions()` 返回 `{ behavior: 'passthrough', message: 'ExecuteTool delegates permission to the target tool.' }`，与 MCPTool 的权限透传模式一致
  - `renderToolUseMessage(input)` 返回格式化字符串：`Executing ${input.tool_name}...`，用于 UI 展示
  - `userFacingName()` 返回 `'ExecuteTool'`
  - `mapToolResultToToolResultBlockParam(content, toolUseID)` 返回标准 tool_result 格式
  - `isEnabled()` 返回 `isToolSearchEnabledOptimistic()`，与 ToolSearchTool 联动启用
  - `isReadOnly()` 返回 `false`（执行的工具可能执行写操作）
  - 原因: 采用与 MCPTool 相同的 `buildTool` + `satisfies ToolDef` 模式，确保类型安全和框架一致性。权限透传采用 `passthrough` 策略，由目标工具自行决定权限逻辑

- [x] 在 `isDeferredTool` 中排除 ExecuteTool
  - 位置: `packages/builtin-tools/src/tools/ToolSearchTool/prompt.ts` 的 `isDeferredTool` 函数内，在 `if (tool.name === TOOL_SEARCH_TOOL_NAME) return false` 之后（~L71）
  - 新增导入: `import { EXECUTE_TOOL_NAME } from '../ExecuteTool/constants.js'`
  - 插入: `if (tool.name === EXECUTE_TOOL_NAME) return false`
  - 原因: ExecuteTool 是核心入口工具，必须在初始化时可用，不能被延迟加载

- [x] 为 ExecuteTool 编写单元测试
  - 测试文件: `packages/builtin-tools/src/tools/ExecuteTool/__tests__/ExecuteTool.test.ts`
  - 测试场景:
    - 正常执行: 构造一个 mock 工具注册到 tools 列表中，调用 ExecuteTool 传入该工具名和合法参数，预期目标工具的 `call` 被调用且返回结果包含 `tool_name`
    - 工具不存在: 传入不存在的 `tool_name`，预期返回错误信息且 `result` 为 null
    - 权限拒绝: mock 目标工具的 `checkPermissions` 返回 `{ behavior: 'deny', message: 'denied' }`，预期 ExecuteTool 返回权限拒绝信息
    - isEnabled 联动: 验证 `ExecuteTool.isEnabled()` 依赖 `isToolSearchEnabledOptimistic()` 的返回值
    - searchHint 存在: 验证 `ExecuteTool.searchHint` 包含关键词 "execute" 和 "tool"
  - 运行命令: `bun test packages/builtin-tools/src/tools/ExecuteTool/__tests__/ExecuteTool.test.ts`
  - 预期: 所有测试通过

**检查步骤:**
- [x] 验证常量文件正确导出 EXECUTE_TOOL_NAME
  - `grep -n 'EXECUTE_TOOL_NAME' packages/builtin-tools/src/tools/ExecuteTool/constants.ts`
  - 预期: 输出包含 `export const EXECUTE_TOOL_NAME = 'ExecuteTool'`
- [x] 验证 prompt 文件正确导出 DESCRIPTION 和 getPrompt
  - `grep -n 'export' packages/builtin-tools/src/tools/ExecuteTool/prompt.ts`
  - 预期: 输出包含 `DESCRIPTION` 和 `getPrompt` 的导出
- [x] 验证 ExecuteTool 主文件使用 buildTool 构建且 satisfies ToolDef
  - `grep -n 'buildTool\|satisfies ToolDef' packages/builtin-tools/src/tools/ExecuteTool/ExecuteTool.ts`
  - 预期: 输出同时包含 `buildTool` 和 `satisfies ToolDef`
- [x] 验证 isDeferredTool 正确排除 ExecuteTool
  - `grep -n 'EXECUTE_TOOL_NAME' packages/builtin-tools/src/tools/ToolSearchTool/prompt.ts`
  - 预期: 输出包含 EXECUTE_TOOL_NAME 的导入和 `isDeferredTool` 中的排除逻辑
- [x] 验证单元测试通过
  - `bun test packages/builtin-tools/src/tools/ExecuteTool/__tests__/ExecuteTool.test.ts`
  - 预期: 所有测试用例通过，无错误

---

### Task 4: ToolSearchTool 搜索增强

**背景:**
[业务语境] — 本 Task 在现有 ToolSearchTool 上叠加 TF-IDF 搜索路径、`discover:` 查询模式和文本模式输出，使模型能通过自然语言描述发现延迟工具，并在 `tool_reference` 不可用时仍能获取工具信息。
[修改原因] — 当前 ToolSearchTool 仅支持关键词搜索（`searchToolsWithKeywords`），缺少语义匹配能力；`mapToolResultToToolResultBlockParam` 仅返回 `tool_reference` 块，不支持非 Anthropic provider；缺少纯发现模式供模型了解工具能力。
[上下游影响] — 本 Task 依赖 Task 1（`isDeferredTool` 白名单制判定）和 Task 2（`buildToolIndex`、`searchTools`、`getToolIndex`）。本 Task 的输出（增强后的 ToolSearchTool）被 Task 5（预取管道）和 Task 6（UI 推荐）间接依赖。

**涉及文件:**
- 修改: `packages/builtin-tools/src/tools/ToolSearchTool/ToolSearchTool.ts`
- 修改: `packages/builtin-tools/src/tools/ToolSearchTool/prompt.ts`
- 新建: `packages/builtin-tools/src/tools/ToolSearchTool/__tests__/ToolSearchTool.test.ts`

**执行步骤:**

- [x] 在 `ToolSearchTool.ts` 中新增 TF-IDF 搜索相关 import — 为并行搜索和结果合并做准备
  - 位置: `packages/builtin-tools/src/tools/ToolSearchTool/ToolSearchTool.ts` 文件顶部 import 区域（L18 之前，现有 import 块之后）
  - 新增 import:
    ```typescript
    import { getToolIndex, searchTools } from 'src/services/toolSearch/toolIndex.js'
    import type { ToolSearchResult } from 'src/services/toolSearch/toolIndex.js'
    import { modelSupportsToolReference } from 'src/utils/toolSearch.js'
    ```
  - 新增权重常量（import 区域之后、`inputSchema` 定义之前）:
    ```typescript
    const KEYWORD_WEIGHT = Number(process.env.TOOL_SEARCH_WEIGHT_KEYWORD ?? '0.4')
    const TFIDF_WEIGHT = Number(process.env.TOOL_SEARCH_WEIGHT_TFIDF ?? '0.6')
    ```
  - 原因: TF-IDF 搜索函数和模型能力判断函数分别定义在 `src/` 下，需显式 import。权重常量支持环境变量调优。

- [x] 在 `ToolSearchTool.ts` 的 `call` 方法中增加 `discover:` 查询模式分支 — 纯发现搜索，不触发延迟加载
  - 位置: `ToolSearchTool.ts` 的 `call` 方法内，在 `selectMatch` 正则匹配之后（~L363）、关键词搜索之前（~L408）
  - 在 `selectMatch` 分支之后插入 `discover:` 分支:
    ```typescript
    // Check for discover: prefix — pure discovery search.
    // Returns tool info (name + description + schema) as text,
    // does NOT trigger deferred tool loading.
    const discoverMatch = query.match(/^discover:(.+)$/i)
    if (discoverMatch) {
      const discoverQuery = discoverMatch[1]!.trim()
      const index = await getToolIndex(deferredTools)
      const tfIdfResults = searchTools(discoverQuery, index, max_results)
      // discover 模式返回文本格式的工具信息
      const textResults = tfIdfResults.map(r => {
        let line = `**${r.name}** (score: ${r.score.toFixed(2)})\n${r.description}`
        if (r.inputSchema) {
          line += `\nSchema: ${JSON.stringify(r.inputSchema)}`
        }
        return line
      })
      const text = textResults.length > 0
        ? `Found ${textResults.length} tools:\n${textResults.join('\n\n')}`
        : 'No matching deferred tools found'
      logSearchOutcome(tfIdfResults.map(r => r.name), 'keyword')
      return buildSearchResult(tfIdfResults.map(r => r.name), query, deferredTools.length)
    }
    ```
  - 更新 `logSearchOutcome` 的 `queryType` 参数: `discover` 模式使用 `'keyword'` 类型（与关键词搜索共用类型，避免修改分析事件的枚举）
  - 原因: `discover:` 模式让模型能了解延迟工具的能力（名称 + 描述 + schema），而不触发 schema 注入，适用于规划阶段或信息收集场景

- [x] 在 `ToolSearchTool.ts` 的 `call` 方法中实现关键词搜索与 TF-IDF 搜索的并行执行和结果合并
  - 位置: `ToolSearchTool.ts` 的 `call` 方法内，替换当前关键词搜索逻辑（L408-L433）
  - 替换原有关键词搜索段为并行搜索 + 合并逻辑:
    ```typescript
    // Keyword search + TF-IDF search in parallel
    const [keywordMatches, index] = await Promise.all([
      searchToolsWithKeywords(query, deferredTools, tools, max_results),
      getToolIndex(deferredTools),
    ])
    const tfIdfResults = searchTools(query, index, max_results)

    // Merge results: keyword score * 0.4 + TF-IDF score * 0.6
    const mergedScores = new Map<string, number>()
    // Add keyword results (assign scores inversely proportional to rank)
    keywordMatches.forEach((name, rank) => {
      const score = (keywordMatches.length - rank) / keywordMatches.length
      mergedScores.set(name, (mergedScores.get(name) ?? 0) + score * KEYWORD_WEIGHT)
    })
    // Add TF-IDF results
    tfIdfResults.forEach(result => {
      mergedScores.set(result.name, (mergedScores.get(result.name) ?? 0) + result.score * TFIDF_WEIGHT)
    })

    // Sort by merged score, take top-N
    const matches = [...mergedScores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, max_results)
      .map(([name]) => name)
    ```
  - 保留后续的 `logForDebugging`、`logSearchOutcome`、空结果 pending servers 逻辑和 `buildSearchResult` 调用不变
  - 原因: 并行执行避免串行延迟；加权合并综合关键词精确匹配和 TF-IDF 语义匹配的优势（TF-IDF 权重更高，因为其语义能力更强）

- [x] 修改 `mapToolResultToToolResultBlockParam` 方法，增加文本模式输出 — 当 `tool_reference` 不可用时返回文本格式工具信息
  - 位置: `ToolSearchTool.ts` 的 `mapToolResultToToolResultBlockParam` 方法（L444-L469）
  - 新增方法参数 `context` 用于获取当前模型信息: 将 `mapToolResultToToolResultBlockParam(content, toolUseID)` 签名改为 `mapToolResultToToolResultBlockParam(content, toolUseID, context?)`，其中 `context` 类型为 `{ mainLoopModel?: string } | undefined`
  - 在方法体中，`content.matches.length === 0` 分支保持不变
  - 在返回 `tool_reference` 块之前，插入 `tool_reference` 支持检查:
    ```typescript
    const supportsToolRef = context?.mainLoopModel
      ? modelSupportsToolReference(context.mainLoopModel)
      : true // 默认假设支持（向后兼容）
    if (!supportsToolRef) {
      // 文本模式: 返回工具名称列表
      return {
        type: 'tool_result',
        tool_use_id: toolUseID,
        content: `Found ${content.matches.length} tool(s): ${content.matches.join(', ')}. Use ExecuteTool with tool_name and params to invoke.`,
      }
    }
    ```
  - 保留原有 `tool_reference` 返回逻辑作为默认路径
  - 原因: 非 Anthropic provider（OpenAI/Gemini/Grok）不支持 `tool_reference` beta 特性，需要回退到文本模式输出，引导模型使用 ExecuteTool

- [x] 更新 `ToolSearchTool/prompt.ts` 的 PROMPT 文本，增加 `discover:` 模式和 TF-IDF 搜索说明
  - 位置: `packages/builtin-tools/src/tools/ToolSearchTool/prompt.ts` 的 `PROMPT_TAIL` 常量（L44-L51）
  - 在 `Query forms:` 部分追加 `discover:` 模式说明:
    ```typescript
    const PROMPT_TAIL = ` ... (保留现有内容) ...

Query forms:
- "select:Read,Edit,Grep" — fetch these exact tools by name
- "discover:schedule cron job" — pure discovery, returns tool info (name, description, schema) without loading. Use when you want to understand available tools before deciding which to invoke.
- "notebook jupyter" — keyword search, up to max_results best matches
- "+slack send" — require "slack" in the name, rank by remaining terms`
  - 原因: 模型需要知道 `discover:` 模式的存在和语义，才能正确使用该功能

- [x] 为 ToolSearchTool 搜索增强编写单元测试
  - 测试文件: `packages/builtin-tools/src/tools/ToolSearchTool/__tests__/ToolSearchTool.test.ts`（新建）
  - 测试框架: `bun:test`（与 `DiscoverSkillsTool.test.ts` 一致）
  - 测试场景:
    - `discover:` 前缀解析: 传入 `query: "discover:send notification"` 调用 `ToolSearchTool.call()`，验证返回结果中 `matches` 非空且包含预期工具名（通过 mock `getToolIndex` 和 `searchTools`）
    - `select:` 前缀保持不变: 传入 `query: "select:SomeTool"` 调用 `ToolSearchTool.call()`，验证返回结果中 `matches` 包含 `"SomeTool"`（mock `findToolByName` 返回对应工具）
    - 关键词搜索 + TF-IDF 合并: mock `searchToolsWithKeywords` 返回 `["ToolA", "ToolB"]`，mock `searchTools` 返回 `[{name: "ToolB", score: 0.9}, {name: "ToolC", score: 0.8}]`，验证合并后 `matches` 包含 `"ToolB"`（两路均有）、`"ToolA"`（仅关键词）、`"ToolC"`（仅 TF-IDF），且 `"ToolB"` 排名靠前
    - 文本模式输出: 调用 `mapToolResultToToolResultBlockParam` 传入 `context: { mainLoopModel: 'claude-3-haiku-20240307' }`，验证返回内容为文本格式（包含 "Found" 和 "ExecuteTool"），而非 `tool_reference` 块
    - tool_reference 模式输出: 调用 `mapToolResultToToolResultBlockParam` 传入 `context: { mainLoopModel: 'claude-sonnet-4-20250514' }`，验证返回内容包含 `type: 'tool_reference'` 块
    - 向后兼容: 调用 `mapToolResultToToolResultBlockParam` 不传 `context` 参数，验证默认返回 `tool_reference` 块（向后兼容）
    - 空结果处理: 传入不匹配的查询，验证返回结果中 `matches` 为空数组
  - Mock 策略: 使用 `bun:test` 的 `mock` 函数 mock `src/services/toolSearch/toolIndex.js` 的 `getToolIndex` 和 `searchTools`，mock `src/utils/toolSearch.js` 的 `modelSupportsToolReference`
  - 运行命令: `bun test packages/builtin-tools/src/tools/ToolSearchTool/__tests__/ToolSearchTool.test.ts`
  - 预期: 所有测试通过

**检查步骤:**

- [x] 验证 TF-IDF 搜索 import 已添加
  - `grep -n "getToolIndex\|searchTools\|modelSupportsToolReference" packages/builtin-tools/src/tools/ToolSearchTool/ToolSearchTool.ts`
  - 预期: 输出包含 `getToolIndex`、`searchTools`、`modelSupportsToolReference` 的 import 行

- [x] 验证 `discover:` 模式分支已添加到 `call` 方法
  - `grep -n "discoverMatch\|discover:" packages/builtin-tools/src/tools/ToolSearchTool/ToolSearchTool.ts`
  - 预期: 输出包含 `discoverMatch` 正则匹配和 `discover:` 分支逻辑

- [x] 验证关键词搜索与 TF-IDF 搜索并行执行
  - `grep -n "Promise.all" packages/builtin-tools/src/tools/ToolSearchTool/ToolSearchTool.ts`
  - 预期: 输出包含 `Promise.all` 调用，参数包含 `searchToolsWithKeywords` 和 `getToolIndex`

- [x] 验证结果合并逻辑使用加权求和
  - `grep -n "KEYWORD_WEIGHT\|TFIDF_WEIGHT" packages/builtin-tools/src/tools/ToolSearchTool/ToolSearchTool.ts`
  - 预期: 输出包含权重常量定义和在合并逻辑中的使用

- [x] 验证 `mapToolResultToToolResultBlockParam` 增加了文本模式分支
  - `grep -n "supportsToolRef\|ExecuteTool" packages/builtin-tools/src/tools/ToolSearchTool/ToolSearchTool.ts`
  - 预期: 输出包含 `modelSupportsToolReference` 调用和 "ExecuteTool" 文本回退

- [x] 验证 prompt.ts 包含 `discover:` 模式说明
  - `grep -n "discover:" packages/builtin-tools/src/tools/ToolSearchTool/prompt.ts`
  - 预期: 输出包含 `discover:` 模式的文档说明

- [x] 验证 TypeScript 编译无错误
  - `bunx tsc --noEmit --pretty 2>&1 | head -30`
  - 预期: 无新增类型错误

- [x] 运行新增单元测试
  - `bun test packages/builtin-tools/src/tools/ToolSearchTool/__tests__/ToolSearchTool.test.ts`
  - 预期: 所有测试通过

**认知变更:**
- [x] [CLAUDE.md] `ToolSearchTool.mapToolResultToToolResultBlockParam` 新增可选第三个参数 `context?: { mainLoopModel?: string }`，用于判断当前模型是否支持 `tool_reference`。不支持时回退到文本输出，引导模型使用 ExecuteTool。调用方（`src/services/api/claude.ts` 的 tool_result 处理逻辑）需传入 context 参数。

### Task 5: 基础设施层验收

**前置条件:**
- Task 1-4 全部完成
- 构建环境: `bun run build` 可用

**端到端验证:**

1. ✅ 运行完整测试套件确保无回归
   - `bun test src/constants/__tests__/tools.test.ts src/services/toolSearch/__tests__/toolIndex.test.ts packages/builtin-tools/src/tools/ExecuteTool/__tests__/ExecuteTool.test.ts packages/builtin-tools/src/tools/ToolSearchTool/__tests__/DiscoverSearch.test.ts 2>&1`
   - 预期: 全部测试通过
   - 失败排查: 检查各 Task 的测试步骤，确认 import 路径和 mock 配置正确

2. ✅ 验证 TypeScript 类型检查通过
   - `bunx tsc --noEmit --pretty 2>&1 | grep -i "error" | head -20`
   - 预期: 无新增类型错误
   - 失败排查: 检查 Task 1-4 中新增/修改文件的 import 路径和类型签名

3. ✅ 验证 CORE_TOOLS 常量被正确使用
   - `grep -rn "CORE_TOOLS" src/ packages/builtin-tools/src/ --include="*.ts" 2>/dev/null`
   - 预期: 在 `tools.ts`、`prompt.ts`（isDeferredTool）、`toolIndex.ts` 中被引用
   - 失败排查: 检查 Task 1 和 Task 2 的 import 步骤

4. ✅ 验证 isDeferredTool 白名单制生效
   - `grep -A5 "export function isDeferredTool" packages/builtin-tools/src/tools/ToolSearchTool/prompt.ts`
   - 预期: 函数体包含 `CORE_TOOLS.has(tool.name)`，不包含旧的 `shouldDefer`、`feature(` 逻辑
   - 失败排查: 检查 Task 1 的重构步骤

5. ✅ 验证构建产物正确
   - `bun run build 2>&1 | tail -5`
   - 预期: 构建成功，输出 dist/cli.js
   - 失败排查: 检查新增文件的 import 路径是否兼容 Bun.build splitting
