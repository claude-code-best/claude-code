# Feature: 20260508_F001 - tool-search

## 需求背景

当前 Claude Code 有 60+ 内置工具和无限 MCP 工具，Agent 在处理任务时缺乏"根据任务描述自动发现最匹配工具"的能力。现有 `ToolSearchTool` 仅处理延迟加载（按需加载 schema via `tool_reference`），不做语义发现。`tool_reference` 机制存在以下局限：

1. **仅 Anthropic 一方 API 支持** — OpenAI/Gemini/Grok 兼容层不支持 `tool_reference` beta 特性
2. **破坏 prompt cache** — 动态注入工具 schema 导致缓存失效
3. **工具列表固定** — 每次请求的工具集在请求开始时就确定了，临时添加工具触发缓存全部失效

用户也无法直观了解哪些工具适合当前任务，缺乏推荐机制。

## 目标

1. 激进精简初始化工具注入，从 60+ 精简到 ~10 个核心工具 + 2 个入口工具（ToolSearch + ExecuteTool）
2. 增强 `ToolSearchTool`，增加 TF-IDF 文本匹配的"工具发现"能力
3. 新建 `ExecuteTool`，提供跨 API provider 的统一工具执行入口
4. 支持用户输入提示词后自动预取推荐工具（类似 skill prefetch）
5. 在 REPL 中展示工具推荐提示条（类似 skill search tips）
6. 搜索范围覆盖：MCP 工具、自定义工具、所有延迟加载的内置工具
7. 复用 `localSearch.ts` 的 tokenize/stem/cosineSimilarity 基础设施

## 方案设计

### 整体架构

四层设计：初始化精简 + 搜索层 + 执行层 + UI 层。

```text
初始化阶段（激进精简）:
  核心工具（~10个，始终加载 schema）     延迟工具（其余全部，仅注入名称列表）
  Bash / Read / Edit / Write / Glob      WebFetch / WebSearch / NotebookEdit
  Grep / Agent / AskUser / ToolSearch    TodoWrite / CronTools / TeamCreate
  ExecuteTool                            SkillTool / PlanMode / ...（50+ 工具）
                                               ↓ MCP 工具也延迟加载

运行时发现与执行:
  用户输入 → 预取管道(异步) → TF-IDF 搜索 → UI 推荐提示
                                                      ↓
  模型处理任务 → ToolSearchTool(TF-IDF搜索) → 返回工具信息文本
                                                      ↓
  模型构造参数 → ExecuteTool(tool_name + params) → 路由执行 → 返回结果
```

### 1. 初始化精简（激进策略）

**核心思路**: 将初始化时注入的工具从 60+ 精简到 ~10 个核心工具 + 2 个入口工具（ToolSearch + ExecuteTool）。其余 50+ 工具全部延迟加载，仅注入名称列表到延迟工具清单。

**始终加载的核心工具**（31 个）:

| 工具 | 始终加载的理由 |
|------|----------------|
| `BashTool` | 几乎所有任务都需要 shell 执行 |
| `FileReadTool` | 读取文件是基础操作 |
| `FileEditTool` | 编辑文件是核心能力 |
| `FileWriteTool` | 写入文件是核心能力 |
| `GlobTool` | 文件搜索是基础操作 |
| `GrepTool` | 内容搜索是基础操作 |
| `AgentTool` | 子 agent 调度是核心架构 |
| `AskUserQuestionTool` | 用户交互是基础能力 |
| `ToolSearchTool` | 工具发现入口 |
| `ExecuteTool` | 延迟工具执行入口（新增） |
| `TaskOutputTool` | 任务输出查询是高频操作 |
| `TaskStopTool` | 任务停止是 agent 生命周期管理 |
| `EnterPlanModeTool` | 进入计划模式是常见工作流 |
| `ExitPlanModeV2Tool` | 退出计划模式是常见工作流 |
| `VerifyPlanExecutionTool` | 计划执行验证与 ExitPlanMode 配套 |
| `TaskCreateTool` | 任务创建（TodoV2）是高频操作 |
| `TaskGetTool` | 任务查询（TodoV2）是高频操作 |
| `TaskUpdateTool` | 任务更新（TodoV2）是高频操作 |
| `TaskListTool` | 任务列表（TodoV2）是高频操作 |
| `TodoWriteTool` | 待办写入是任务跟踪基础 |
| `SendMessageTool` | 团队内 agent 通信 |
| `TeamCreateTool` | 团队创建（swarm 模式核心） |
| `TeamDeleteTool` | 团队删除（swarm 模式核心） |
| `ListPeersTool` | 跨会话通信发现 |
| `SkillTool` | 技能调用（/skill 命令） |
| `WebFetchTool` | Web 内容获取是常见需求 |
| `WebSearchTool` | Web 搜索是常见需求 |
| `NotebookEditTool` | Notebook 编辑是数据分析基础 |
| `LSPTool` | LSP 代码智能是开发基础 |
| `MonitorTool` | 后台监控进程（日志/轮询） |
| `SleepTool` | 等待时长（轮询 deploy 等场景） |

**延迟加载的工具**（约 26 个内置工具 + 全部 MCP 工具）:

所有未在核心列表中的内置工具，包括：

| 工具 | 延迟加载的理由 |
|------|----------------|
| `ConfigTool` | 配置操作低频（ant only） |
| `TungstenTool` | 专用工具低频（ant only） |
| `SuggestBackgroundPRTool` | PR 建议低频 |
| `WebBrowserTool` | 浏览器操作低频（feature-gated） |
| `OverflowTestTool` | 测试专用（feature-gated） |
| `CtxInspectTool` | 上下文检查低频（debug/feature-gated） |
| `TerminalCaptureTool` | 终端捕获低频（feature-gated） |
| `EnterWorktreeTool` | worktree 操作低频 |
| `ExitWorktreeTool` | worktree 操作低频 |
| `REPLTool` | REPL 模式低频（ant only） |
| `WorkflowTool` | 工作流脚本低频（feature-gated） |
| `CronCreateTool` | 调度创建低频 |
| `CronDeleteTool` | 调度删除低频 |
| `CronListTool` | 调度列表低频 |
| `RemoteTriggerTool` | 远程触发低频 |
| `BriefTool` | 通信通道低频（KAIROS） |
| `SendUserFileTool` | 文件发送低频（KAIROS） |
| `PushNotificationTool` | 推送通知低频（KAIROS） |
| `SubscribePRTool` | PR 订阅低频 |
| `ReviewArtifactTool` | 产物审查低频 |
| `PowerShellTool` | PowerShell 低频（需显式启用） |
| `SnipTool` | 上下文裁剪低频（HISTORY_SNIP） |
| `DiscoverSkillsTool` | 技能发现低频（feature-gated） |
| `ListMcpResourcesTool` | MCP 资源列表低频 |
| `ReadMcpResourceTool` | MCP 资源读取低频 |
| `TestingPermissionTool` | 仅测试环境 |
| 全部 MCP 工具 | 按连接动态加载 |

**实现方式**:

1. **系统提示词增强**（`src/context.ts` 或 `src/constants/prompts.ts`）：

在系统提示词中加入工具发现引导指令，确保模型始终知道如何获取延迟工具：

```text
When you need a capability that isn't in your available tools, use ToolSearch
to discover and load it. ToolSearch can find all deferred tools by keyword or
task description. After discovering a tool, use ExecuteTool to invoke it with
the appropriate parameters.

Common deferred tools include: CronTools (scheduling), WorktreeTools (git
isolation), SnipTool (context management), DiscoverSkills (skill search),
MCP resource tools, and many more. Always search first rather than assuming
a capability is unavailable.
```

2. **新增核心工具集合常量**（`src/constants/tools.ts`）：

```typescript
export const CORE_TOOLS = new Set([
  // 文件操作
  'Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep',
  // Agent 与交互
  'Agent', 'AskUserQuestion', 'SendMessage', 'ListPeers',
  // 团队（swarm）
  'TeamCreate', 'TeamDelete',
  // 任务管理
  'TaskOutput', 'TaskStop',
  'TaskCreate', 'TaskGet', 'TaskUpdate', 'TaskList',
  'TodoWrite',
  // 规划
  'EnterPlanMode', 'ExitPlanMode', 'VerifyPlanExecution',
  // Web
  'WebFetch', 'WebSearch',
  // 编辑器
  'NotebookEdit',
  // 代码智能
  'LSP',
  // 技能
  'Skill',
  // 调度与监控
  'Sleep', 'Monitor',
  // 工具发现与执行（新增）
  'ToolSearch', 'ExecuteTool',
])
```

2. **修改 `isDeferredTool` 判定逻辑**（`ToolSearchTool/prompt.ts`）：

```typescript
export function isDeferredTool(tool: Tool): boolean {
  if (tool.alwaysLoad === true) return false
  if (tool.name === TOOL_SEARCH_TOOL_NAME) return false
  if (tool.name === EXECUTE_TOOL_NAME) return false
  // 核心工具不延迟
  if (CORE_TOOLS.has(tool.name)) return false
  // MCP 工具和其余内置工具全部延迟
  return true
}
```

3. **修改 `getAllBaseTools()` 注册逻辑**（`src/tools.ts`）：

核心工具直接注册（带完整 schema），延迟工具也注册到工具池（用于 ExecuteTool 查找），但标记为 deferred。

4. **延迟工具名称列表注入**（`src/services/api/claude.ts`）：

构建 API 请求时，核心工具的 schema 正常注入。延迟工具仅注入名称列表到 `<available-deferred-tools>` 或 `system-reminder` 附件中，模型通过 ToolSearchTool 获取详情。

**收益**:
- 初始 prompt 体积减少约 30-40%（26 个内置工具 schema → 名称列表，加上 MCP 工具全延迟）
- Prompt cache 命中率提升（核心 31 工具列表稳定，延迟工具仅名称列表）
- 支持无限工具扩展（不受 context window 限制）

**权衡**:
- 非核心工具首次使用需要一轮 ToolSearch → ExecuteTool 的额外交互
- 模型需要更积极地使用 ToolSearchTool 发现可用工具

### 2. 工具索引层

**新增文件**: `src/services/toolSearch/toolIndex.ts`

从 `src/services/skillSearch/localSearch.ts` 直接 import 复用 `tokenizeAndStem`、`computeWeightedTf`、`computeIdf`、`cosineSimilarity` 算法，新建工具索引。不提取为独立共享模块——skill 和 tool 的索引结构不同（`SkillIndexEntry` vs `ToolIndexEntry`），强行抽象反而增加复杂度。

**索引条目结构**:

```typescript
interface ToolIndexEntry {
  name: string                    // 工具名（如 "FileEditTool" 或 "mcp__server__action"）
  normalizedName: string          // 小写 + 连字符替换
  description: string             // 工具描述文本
  searchHint: string | undefined  // buildTool 中定义的 searchHint
  isMcp: boolean                  // 是否 MCP 工具
  isDeferred: boolean             // 是否延迟加载工具
  inputSchema: object | undefined // 参数 schema（JSON Schema 格式，供 discover 模式返回）
  tokens: string[]                // 分词后的 token 列表
  tfVector: Map<string, number>   // TF-IDF 向量
}
```

**字段权重**:

| 字段 | 权重 | 说明 |
|------|------|------|
| name | 3.0 | 工具名称（CamelCase 拆分、MCP `__` 拆分） |
| searchHint | 2.5 | 工具的 `searchHint` 字段（高信号） |
| description | 1.0 | 工具描述文本 |

**索引生命周期**:
- 按需构建，缓存在会话中
- MCP 工具连接/断开时触发增量更新（复用 `DeferredToolsDelta` 机制）
- 内置工具在首次构建时全量索引
- 仅索引延迟工具（核心工具已在模型上下文中，无需发现）

**工具名解析**:
- MCP 工具：`mcp__server__action` → 拆分为 `["mcp", "server", "action"]`
- 内置工具：`FileEditTool` → CamelCase 拆分为 `["file", "edit", "tool"]`
- 与现有 `ToolSearchTool.parseToolName` 逻辑对齐

### 3. 搜索层增强

**修改文件**: `packages/builtin-tools/src/tools/ToolSearchTool/ToolSearchTool.ts`

在现有 `searchToolsWithKeywords` 基础上，新增 TF-IDF 搜索路径：

**增强的搜索流程**:

```
query 输入
    │
    ├── select: 前缀 → 直接选择（保留现有逻辑）
    │
    └── 关键词搜索 → 并行执行两路搜索
         │
         ├── searchToolsWithKeywords（现有，关键词匹配 + 评分）
         │
         └── searchToolsWithTfIdf（新增，TF-IDF 余弦相似度）
              │
              └── 合并结果 → 加权求和 → 排序 → top-N
```

**结果合并策略**:
- 关键词匹配分数 × 0.4 + TF-IDF 相似度分数 × 0.6
- 权重可通过环境变量 `TOOL_SEARCH_WEIGHT_KEYWORD` / `TOOL_SEARCH_WEIGHT_TFIDF` 调整
- 去重：同一工具取两路中最高分

**输出格式变更**:

`mapToolResultToToolResultBlockParam` 增加文本模式返回（当 `tool_reference` 不可用时）:

```typescript
// 当 tool_reference 可用时（现有逻辑，保持不变）
{ type: 'tool_reference', tool_name: "..." }

// 当 tool_reference 不可用时（新增）
{ type: 'text', text: "Found 3 tools:\n1. **ToolName** (score: 0.85)\n   Description...\n   Schema: {...}" }
```

判断条件：复用 `modelSupportsToolReference()` 或检测当前 provider 是否支持。

**新增 `discover` 查询模式**:

```
discover:<任务描述>  — 纯发现搜索，不触发延迟加载，只返回工具信息
```

与现有 `select:` 模式互补。`discover:` 返回工具名 + 描述 + 参数 schema（文本形式），供 ExecuteTool 使用。

### 4. 执行层（ExecuteTool）

**新增文件**: `packages/builtin-tools/src/tools/ExecuteTool/`

**工具定义**:

```typescript
const ExecuteTool = buildTool({
  name: 'ExecuteTool',
  searchHint: 'execute run invoke a tool by name with parameters',

  inputSchema: z.object({
    tool_name: z.string().describe('Name of the tool to execute'),
    params: z.record(z.unknown()).describe('Parameters to pass to the tool'),
  }),

  async call(input, context) {
    // 1. 在全局工具注册表中查找目标工具
    // 2. 验证 params 是否符合目标工具的 inputSchema
    // 3. 调用目标工具的 call 方法
    // 4. 返回执行结果
  },
})
```

**核心逻辑**:

1. **工具查找**: 通过 `findToolByName` 在完整工具池（built-in + MCP）中查找
2. **参数验证**: 用目标工具的 `inputSchema` 验证传入参数
3. **权限继承**: 复用目标工具的 `checkPermissions` 方法
4. **执行委托**: 调用目标工具的 `call(input, context)` 方法
5. **结果透传**: 直接返回目标工具的执行结果

**权限模型**:
- ExecuteTool 本身不做额外权限检查
- 权限检查委托给目标工具的 `checkPermissions`
- 用户审批时显示实际工具名和操作内容（而非 "ExecuteTool"）

**工具注册**:
- 在 `src/tools.ts` 的 `getAllBaseTools()` 中注册
- 与 ToolSearchTool 关联启用：当 `isToolSearchEnabledOptimistic()` 为 true 时注册

### 5. 预取管道

**新增文件**: `src/services/toolSearch/prefetch.ts`

**触发时机**: 用户提交输入后、发送 API 请求前

**流程**:

```
用户输入提交
    │
    ├── 异步启动预取（不阻塞主流程）
    │   │
    │   ├── 提取用户消息文本
    │   ├── 调用 toolIndex.search(message, limit: 3)
    │   └── 存储结果到模块级缓存
    │
    └── API 请求构建时
        │
        └── collectToolSearchPrefetch()
            │
            ├── 有结果 → 注入 system-reminder 或 <available-tools-hint>
            └── 无结果 → 不做任何附加
```

**Hook 集成点**: 在 `REPL.tsx` 的消息提交流程或 `QueryEngine` 的请求构建环节中集成。

**并发安全**: 预取为异步操作，不阻塞主请求流程。如果预取未完成则跳过推荐。

### 6. 用户推荐 UI

**新增文件**: `src/components/ToolSearchHint.tsx`

**展示形式**: 在 REPL 输入区域上方渲染推荐提示条（类似现有 skill search tips 的设计）。

**UI 规格**:
- 显示匹配度最高的 2-3 个工具
- 每个工具显示：工具名 + 简短描述（一行截断） + 匹配分数
- 样式与现有 skill search tips 对齐（Ink 组件，使用 theme 色系）
- 可通过键盘快捷键选择（Tab 切换、Enter 确认）
- 选择后将工具信息追加到当前消息的上下文中

**条件显示**:
- 仅当预取结果非空时显示
- 匹配分数低于阈值（默认 0.15）时不显示
- 用户可通过 `settings.json` 关闭推荐提示

### 7. 搜索范围控制

采用激进精简策略后，搜索范围逻辑简化为：

- **索引范围**: 所有延迟工具（即核心工具列表之外的全部工具），包括所有 MCP 工具和所有非核心内置工具
- **排除范围**: 核心工具（`CORE_TOOLS` 集合中的工具）不索引
- **动态更新**: MCP 工具连接/断开时增量更新索引

可通过环境变量 `TOOL_SEARCH_EXCLUDE` 追加排除项，`TOOL_SEARCH_INCLUDE_FORCE` 强制索引某些工具。

## 实现要点

### 关键技术决策

1. **复用 vs 重写 TF-IDF 基础设施**: 直接 import `localSearch.ts` 的 `tokenizeAndStem`、`computeWeightedTf`、`computeIdf`、`cosineSimilarity` 函数。不提取为独立模块，因为 skill 和 tool 的索引结构不同（SkillIndexEntry vs ToolIndexEntry），强行抽象会增加复杂度。

2. **ExecuteTool vs tool_reference**: ExecuteTool 是通用方案，兼容所有 API provider。当 provider 支持 `tool_reference` 时，优先使用 `tool_reference`（性能更好，模型认知负担更低）。当不支持时，回退到 ExecuteTool。

3. **索引更新策略**: MCP 工具连接/断开时，通过 `DeferredToolsDelta` 机制检测变化，增量更新索引而非全量重建。

4. **预取不阻塞主流程**: 预取为 fire-and-forget 异步操作。如果预取未完成，API 请求正常发送，不做任何等待。

### 难点

1. **权限透传**: ExecuteTool 调用目标工具时需要正确透传权限上下文，确保用户审批流程与直接调用目标工具一致。

2. **参数 schema 验证**: MCP 工具的 schema 可能非常复杂（嵌套对象、oneOf 等），ExecuteTool 需要优雅地处理 schema 验证失败的情况。

3. **缓存一致性**: 工具索引缓存需要在 MCP 连接变化时及时更新，避免搜索到已失效的工具。

### 依赖

- `src/services/skillSearch/localSearch.ts` — TF-IDF 算法复用
- `packages/builtin-tools/src/tools/ToolSearchTool/` — 现有搜索逻辑基础
- `src/utils/toolSearch.ts` — 工具搜索基础设施（模式判断、阈值计算）
- `packages/builtin-tools/src/tools/MCPTool/MCPTool.ts` — MCP 工具执行参考

### 新增文件清单

| 文件 | 职责 |
|------|------|
| `src/services/toolSearch/toolIndex.ts` | TF-IDF 工具索引构建与查询 |
| `src/services/toolSearch/prefetch.ts` | 用户输入预取管道 |
| `packages/builtin-tools/src/tools/ExecuteTool/ExecuteTool.ts` | 工具执行入口 |
| `packages/builtin-tools/src/tools/ExecuteTool/prompt.ts` | ExecuteTool prompt 定义 |
| `packages/builtin-tools/src/tools/ExecuteTool/constants.ts` | 常量定义 |
| `src/components/ToolSearchHint.tsx` | 用户推荐 UI 组件 |

### 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `packages/builtin-tools/src/tools/ToolSearchTool/ToolSearchTool.ts` | 新增 TF-IDF 搜索路径、discover 模式 |
| `packages/builtin-tools/src/tools/ToolSearchTool/prompt.ts` | 更新 prompt 文档、修改 `isDeferredTool` 判定逻辑 |
| `src/constants/tools.ts` | 新增 `CORE_TOOLS` 常量集合 |
| `src/tools.ts` | 注册 ExecuteTool、调整 `getAllBaseTools()` 工具注册 |
| `src/utils/toolSearch.ts` | 适配新的延迟判定逻辑 |
| `src/constants/prompts.ts` | 添加 ToolSearch 引导指令到系统提示词 |
| `src/services/api/claude.ts` | 集成预取管道、调整延迟工具注入方式 |
| `src/screens/REPL.tsx` | 集成 ToolSearchHint 组件 |

## 验收标准

- [ ] 初始化时仅加载 ~10 个核心工具 schema，其余工具延迟加载
- [ ] 延迟工具名称列表正确注入到 API 请求中
- [ ] ToolSearchTool 支持基于 TF-IDF 的工具发现搜索（`discover:` 模式）
- [ ] ToolSearchTool 支持关键词 + TF-IDF 混合搜索
- [ ] ExecuteTool 可通过 tool_name + params 执行任意已注册工具
- [ ] ExecuteTool 在所有 API provider（Anthropic/OpenAI/Gemini/Grok）下均可工作
- [ ] MCP 工具连接/断开时索引自动更新
- [ ] 用户输入后预取管道异步工作，不阻塞主流程
- [ ] REPL 中展示工具推荐提示条（可配置开关）
- [ ] `bun run precheck` 零错误通过
- [ ] 新增单元测试覆盖：初始化精简验证、工具索引构建、TF-IDF 搜索、结果合并、ExecuteTool 执行
