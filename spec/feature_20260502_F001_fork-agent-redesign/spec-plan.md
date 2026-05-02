# Fork Agent 显式参数触发重构 执行计划

**目标:** 将 FORK_SUBAGENT 从隐式行为改为显式 `fork: true` 参数触发，解耦 forceAsync，保持向后兼容

**技术栈:** TypeScript, Zod schema, Bun test, React/Ink (prompt UI)

**设计文档:** spec/feature_20260502_F001_fork-agent-redesign/spec-design.md

## 改动总览

- 本次改动涉及 3 个修改文件：`AgentTool.tsx`（Schema + 路由 + forceAsync 解耦）、`prompt.ts`（引导文本）、`defines.ts`（注释更新）。新建 1 个测试文件 `prompt.test.ts`。
- Task 1 是 Task 2 的前置：Task 1 完成 Schema 变更和路由重构后，Task 2 才能安全地调整 prompt 文本（prompt 行为描述必须与代码实际行为一致）。
- 关键设计决策：fork 参数添加到 `baseInputSchema` 而非 `fullInputSchema`，因为 fork 是基础 agent 能力而非 multi-agent 特有能力。

---

### Task 0: 环境准备

**背景:**
确保构建和测试工具链在当前开发环境中可用，避免后续 Task 因环境问题阻塞。

**执行步骤:**
- [x] 验证构建工具可用
  - `bun --version`
  - 确认输出 Bun 版本号
- [x] 验证测试工具可用
  - `bun test --help 2>&1 | head -3`
  - 确认输出包含 test 相关帮助信息

**检查步骤:**
- [x] 构建命令执行成功
  - `bun run build 2>&1 | tail -5`
  - 预期: 构建成功，输出包含 dist/cli.js
- [x] 现有测试通过
  - `bun test packages/builtin-tools/src/tools/AgentTool/__tests__/ 2>&1 | tail -10`
  - 预期: 所有现有测试通过，无失败

---

### Task 1: 核心路由重构

**背景:**
[业务语境] — 当前 `FORK_SUBAGENT` flag 启用时，所有省略 `subagent_type` 的 agent 调用隐式走 fork 路径，导致探索任务被迫使用父级同等级模型，token 消耗大增。本次重构将 fork 从隐式行为改为显式 `fork: true` 参数触发。
[修改原因] — `AgentTool.tsx` 中路由逻辑（`effectiveType` / `isForkPath`）通过 `subagent_type` 是否省略来判断 fork 路径，需改为通过 `fork` 布尔参数显式触发。同时 `forceAsync` 变量绑定在 `isForkSubagentEnabled()` 上，导致 fork flag 开启时所有 agent 强制异步，需解耦。
[上下游影响] — 本 Task 的输出（`fork` 参数、新路由逻辑）被 Task 2（prompt 文本调整）依赖。本 Task 无前置依赖。

**涉及文件:**
- 修改: `packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx`
- 修改: `scripts/defines.ts`

**执行步骤:**
- [x] 在 baseInputSchema 中新增 `fork` 字段
  - 位置: `packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx:baseInputSchema()` (~L136-152)，在 `run_in_background` 字段之后
  - 在 `run_in_background` 字段的闭合 `),` 之后，闭合 `})` 之前，新增：
    ```ts
    fork: z
      .boolean()
      .optional()
      .describe(
        'Set to true to fork from the parent conversation context. The child inherits full history, system prompt, and model. Requires FORK_SUBAGENT feature flag.',
      ),
    ```
  - 原因: fork 参数需要在基础 schema 中声明，与 `subagent_type`、`run_in_background` 同级，因为它是所有 agent 调用的可选参数，不限于 multi-agent 场景。

- [x] 重构 inputSchema memo 的裁剪逻辑
  - 位置: `packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx:inputSchema()` (~L193-204)
  - 将 L194-203 替换为：
    ```ts
    let schema = feature('KAIROS') ? fullInputSchema() : fullInputSchema().omit({ cwd: true });
    if (isBackgroundTasksDisabled) {
      schema = schema.omit({ run_in_background: true });
    }
    if (!isForkSubagentEnabled()) {
      schema = schema.omit({ fork: true });
    }
    return schema;
    ```
  - 同时删除 L196-202 的 GrowthBook 注释块（该注释描述的是旧 `forceAsync` 行为，已不适用）。
  - 原因: fork 字段仅在 `FORK_SUBAGENT` flag 启用时可见；`run_in_background` 不再受 `isForkSubagentEnabled()` 影响，两者独立裁剪。

- [x] 更新 AgentToolInput 类型声明
  - 位置: `packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx` (~L211-217)，`AgentToolInput` type 定义
  - 在 `z.infer<ReturnType<typeof baseInputSchema>> & {` 的下一行（`name?: string;` 之前），新增 `fork?: boolean;`
  - 原因: 类型声明必须包含 `fork` 字段，确保 `call()` 解构时有正确的类型推断。

- [x] 更新 inputSchema 附近的 fork gate 注释
  - 位置: `packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx` (~L207-210)，`AgentToolInput` 上方的注释
  - 将 L209-210 的注释：
    ```ts
    // subagent_type is optional; call() defaults it to general-purpose when the
    // fork gate is off, or routes to the fork path when the gate is on.
    ```
  - 替换为：
    ```ts
    // subagent_type is optional; call() defaults it to general-purpose.
    // fork is gated by FORK_SUBAGENT flag; when omitted or flag is off, no fork.
    ```
  - 原因: 旧行为描述与新的显式 fork 触发逻辑不一致，需要更新。

- [x] 在 call() 解构中新增 `fork` 参数
  - 位置: `packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx:call()` (~L322-333)，参数解构
  - 在 `subagent_type,` 之后（L324），新增 `fork,`
  - 原因: `call()` 需要从输入中提取 `fork` 值用于路由判断。

- [x] 重构路由逻辑为显式 fork 触发
  - 位置: `packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx:call()` (~L409-414)
  - 将 L409-414 替换为：
    ```ts
    // Fork routing: explicit `fork: true` parameter triggers the fork path
    // (inherits parent context and model). Requires FORK_SUBAGENT flag.
    // subagent_type is ignored when fork takes effect.
    const isForkPath = fork === true && isForkSubagentEnabled();
    const effectiveType = subagent_type ?? GENERAL_PURPOSE_AGENT.agentType;
    ```
  - 原因: 将隐式路由（省略 `subagent_type` 触发 fork）改为显式参数触发（`fork: true`），同时保持 `subagent_type` 省略时走 general-purpose 的原有行为。

- [x] 删除 forceAsync 变量及其注释
  - 位置: `packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx:call()` (~L695-697)
  - 删除 L695-697（注释 + `const forceAsync = isForkSubagentEnabled();`）
  - 原因: `forceAsync` 不再绑定 `isForkSubagentEnabled()`，fork agent 的异步行为由 `run_in_background` 参数控制，与普通 agent 一致。

- [x] 从 shouldRunAsync 中移除 forceAsync 条件
  - 位置: `packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx:call()` (~L708-715)
  - 将 L708-715 的 `shouldRunAsync` 计算中的 `forceAsync ||` 移除：
    ```ts
    const shouldRunAsync =
      (run_in_background === true ||
        selectedAgent.background === true ||
        isCoordinator ||
        assistantForceAsync ||
        (proactiveModule?.isProactiveActive() ?? false)) &&
      !isBackgroundTasksDisabled;
    ```
  - 原因: `forceAsync` 变量已删除，fork agent 不再全局强制异步。

- [x] 更新 enableSummarization 使用 isForkPath 替代 isForkSubagentEnabled()
  - 位置: `packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx:call()` (~L892)
  - 将：
    ```ts
    enableSummarization: isCoordinator || isForkSubagentEnabled() || getSdkAgentProgressSummariesEnabled(),
    ```
  - 替换为：
    ```ts
    enableSummarization: isCoordinator || isForkPath || getSdkAgentProgressSummariesEnabled(),
    ```
  - 原因: `enableSummarization` 应仅在当前调用实际走 fork 路径时启用，而非 flag 全局启用。`isForkPath` 是当前调用的运行时判断结果。

- [x] 更新 defines.ts 中 FORK_SUBAGENT 的注释
  - 位置: `scripts/defines.ts` (~L55)
  - 将：
    ```ts
    // 'FORK_SUBAGENT',            // 已禁用：启用后 prompt 引导模型用 fork（继承父模型）替代 Explore（haiku），导致探索任务使用同等级模型
    ```
  - 替换为：
    ```ts
    // 'FORK_SUBAGENT',            // 已禁用：显式 `fork: true` 参数触发 fork 路径（继承父级上下文和模型），不影响 forceAsync 和探索任务模型选择
    ```
  - 原因: 旧注释描述的是隐式 fork 行为的问题，新注释描述的是当前显式参数触发的设计。

- [x] 为路由逻辑重构编写单元测试
  - 测试文件: `packages/builtin-tools/src/tools/AgentTool/__tests__/agentToolUtils.test.ts`
  - 测试场景（通过导出路由判断辅助函数或验证 inputSchema 裁剪行为）:
    - `isForkSubagentEnabled() 返回 false 时`: `inputSchema()` 不包含 `fork` 字段（通过 `.omit({ fork: true })` 裁剪）
    - `isBackgroundTasksDisabled 为 true 时`: `inputSchema()` 不包含 `run_in_background` 字段，但仍包含 `fork` 字段
    - 两个条件同时满足时: `inputSchema()` 同时 omit `run_in_background` 和 `fork`
  - 运行命令: `bun test packages/builtin-tools/src/tools/AgentTool/__tests__/agentToolUtils.test.ts`
  - 预期: 所有测试通过

**检查步骤:**
- [x] 验证 `fork` 字段已添加到 baseInputSchema
  - `grep -n 'fork:' packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx | head -5`
  - 预期: 输出至少包含 1 行 schema 定义中的 `fork:` 和 1 行类型中的 `fork?:`

- [x] 验证 forceAsync 已完全移除
  - `grep -n 'forceAsync' packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx`
  - 预期: 无输出（grep 返回非零退出码）

- [x] 验证 isForkSubagentEnabled() 在 call() 中仅用于路由判断
  - `grep -n 'isForkSubagentEnabled' packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx`
  - 预期: 仅出现在 `inputSchema()` 的 `!isForkSubagentEnabled()` 裁剪条件和路由的 `fork === true && isForkSubagentEnabled()` 中，不出现在 shouldRunAsync 或 enableSummarization 中

- [x] 验证 defines.ts 注释已更新
  - `grep 'FORK_SUBAGENT' scripts/defines.ts`
  - 预期: 输出行包含 "显式 `fork: true` 参数触发"

- [x] 运行 precheck 确认无类型/lint/测试错误
  - `bun run precheck`
  - 预期: 零错误通过

---

### Task 2: Prompt 文本调整

**背景:**
[业务语境] — Task 1 将 fork 从隐式行为（省略 `subagent_type` 触发）改为显式参数（`fork: true`），prompt.ts 中的引导文本必须同步更新，否则模型仍会尝试用旧方式触发 fork。
[修改原因] — 当前 prompt.ts 引导模型"省略 `subagent_type` 以触发 fork"（~L85 `omit \`subagent_type\``），且 forkExamples 中省略了 `subagent_type`（隐式触发）。这些文本与 Task 1 的新路由逻辑矛盾。此外，背景任务说明的显示条件 `!forkEnabled` 不再正确——Task 1 已解耦 forceAsync，fork agent 不再强制异步，背景任务说明应在 fork 启用时也显示。
[上下游影响] — 本 Task 依赖 Task 1 完成（Task 1 重构了路由逻辑，本 Task 更新对应的 prompt 文本）。本 Task 仅修改 prompt 文本，不影响运行时逻辑。

**涉及文件:**
- 修改: `packages/builtin-tools/src/tools/AgentTool/prompt.ts`

**执行步骤:**

- [x] 替换 `whenToForkSection` 中的 fork 触发说明
  - 位置: `packages/builtin-tools/src/tools/AgentTool/prompt.ts` `getPrompt()` 函数内 `whenToForkSection` 模板字面量（~L80-97）
  - 将 `## When to fork` 标题下的第一段文本（从 "Fork yourself (omit..." 到 "...Do research before jumping to implementation."）替换为:
    ```
    When you need to delegate work that benefits from full conversation context (e.g., continuing a multi-file refactor where the child needs the same system prompt and history), use `fork: true`. For most tasks, prefer specialized agent types (Explore, Plan, general-purpose).
    ```
  - "Don't peek."、"Don't race."、"Writing a fork prompt." 段落保持不变
  - 原因: 移除"省略 subagent_type"的引导，改为说明 `fork: true` 的适用场景

- [x] 更新 `writingThePromptSection` 中的术语
  - 位置: `packages/builtin-tools/src/tools/AgentTool/prompt.ts` `getPrompt()` 函数内 `writingThePromptSection` 模板字面量（~L99-113）
  - 将 ~L103 的条件文本从 `'When spawning a fresh agent (with a `subagent_type`), it starts with zero context. '` 替换为 `'When spawning an agent without `fork: true`, it starts with zero context. '`
  - 将 ~L110 的条件文本从 `'For fresh agents, terse'` 替换为 `'For non-fork agents, terse'`
  - 原因: fork 通过 `fork: true` 显式触发，"fresh agent"与"fork"的对立不再准确，改为"non-fork agents"

- [x] 替换 `shared` section 中的 fork 使用说明
  - 位置: `packages/builtin-tools/src/tools/AgentTool/prompt.ts` `getPrompt()` 函数内 `shared` 模板字面量（~L208-212）
  - 将整个条件分支（`forkEnabled ? ... : ...`）替换为统一文本:
    ```
    When using the ${AGENT_TOOL_NAME} tool, specify a subagent_type parameter to select which agent type to use. If omitted, the general-purpose agent is used.${forkEnabled ? ` Set \`fork: true\` to fork from the parent conversation context, inheriting full history and model.` : ''}
    ```
  - 原因: 省略 `subagent_type` 现在总是走 general-purpose，统一两分支为基础文本 + fork 追加说明

- [x] 移除背景任务说明的 `!forkEnabled` 条件
  - 位置: `packages/builtin-tools/src/tools/AgentTool/prompt.ts` `getPrompt()` 函数内背景任务说明的条件判断（~L259-261）
  - 将条件从 `!isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS) && !isInProcessTeammate() && !forkEnabled` 改为 `!isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS) && !isInProcessTeammate()`
  - 原因: Task 1 已解耦 forceAsync，fork agent 不再强制异步，背景任务说明应在 fork 启用时也显示

- [x] 更新 continue agent note 中的术语
  - 位置: `packages/builtin-tools/src/tools/AgentTool/prompt.ts` `getPrompt()` 函数内 continue agent 说明（~L267）
  - 将条件文本从 `'Each fresh Agent invocation with a subagent_type starts without context — provide a complete task description.'` 替换为 `'Each non-fork Agent invocation starts without context — provide a complete task description.'`
  - 原因: 与 writingThePromptSection 保持术语一致

- [x] 更新 `forkExamples` 中第一个示例调用，添加 `fork: true` 参数
  - 位置: `packages/builtin-tools/src/tools/AgentTool/prompt.ts` `getPrompt()` 函数内 `forkExamples` 模板字面量（~L120-124）
  - 在 `Agent({...})` 调用中 `description:` 行之后添加 `fork: true,` 行
  - 第二个示例（~L133-139）是"mid-wait"场景无工具调用，保持不变；第三个示例（~L141-154）有 `subagent_type: "code-reviewer"` 是 fresh agent 场景，保持不变
  - 原因: 第一个示例展示 fork 用法，需要显式传入 `fork: true`

- [x] 为 prompt.ts 的 fork 相关文本变更编写单元测试
  - 测试文件: `packages/builtin-tools/src/tools/AgentTool/__tests__/prompt.test.ts`
  - 测试场景:
    - `forkEnabled = true` 时: prompt 不包含 "omit `subagent_type`" 文本，包含 "`fork: true`" 文本
    - `forkEnabled = true` 时: prompt 包含 "non-fork" 术语（替代 "fresh agent"）
    - `forkEnabled = true` 时: prompt 包含 "Set `fork: true` to fork from the parent" 说明
    - `forkEnabled = true` 时: prompt 包含背景任务说明（`run_in_background`）
    - `forkEnabled = false` 时: prompt 不包含 "`fork: true`" 文本，不包含 "When to fork" section
    - `forkEnabled = false` 时: prompt 包含 "general-purpose agent" 回退说明
  - Mock 列表: `isForkSubagentEnabled`（返回 true/false）、`getFeatureValue_CACHED_MAY_BE_STALE`（返回 false）、`shouldInjectAgentListInMessages`（返回 false）、`isInProcessTeammate`（返回 false）、`isTeammate`（返回 false）、`getSubscriptionType`（返回 'pro'）、`hasEmbeddedSearchTools`（返回 false）、环境变量 `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS` 未定义
  - 运行命令: `bun test packages/builtin-tools/src/tools/AgentTool/__tests__/prompt.test.ts`
  - 预期: 所有测试通过

**检查步骤:**
- [x] 验证 prompt 中不再包含 "omit `subagent_type`" 引导文本
  - `grep -n "omit" packages/builtin-tools/src/tools/AgentTool/prompt.ts`
  - 预期: 无输出

- [x] 验证 prompt 中包含 "`fork: true`" 文本
  - `grep -c "fork: true" packages/builtin-tools/src/tools/AgentTool/prompt.ts`
  - 预期: 输出 >= 3（shared section + whenToForkSection + forkExamples）

- [x] 验证背景任务条件中不再包含 `!forkEnabled`
  - `grep -n "forkEnabled" packages/builtin-tools/src/tools/AgentTool/prompt.ts`
  - 预期: 所有匹配行均为 `forkEnabled ?` 形式的三元表达式条件，不包含 `!forkEnabled`

- [x] 运行 prompt 单元测试
  - `bun test packages/builtin-tools/src/tools/AgentTool/__tests__/prompt.test.ts`
  - 预期: 所有测试通过

- [x] 运行 precheck 确保无回归
  - `bun run precheck`
  - 预期: 零错误通过（typecheck + lint + test）

---

### Task 3: Fork Agent 显式参数触发 验收

**前置条件:**
- 启动命令: `bun run dev`（开发模式）
- 环境变量: `FEATURE_FORK_SUBAGENT=1` 启用 fork 功能

**端到端验证:**

1. 运行完整测试套件确保无回归
   - `bun run precheck`
   - 预期: typecheck + lint + test 全部通过，零错误
   - 失败排查: 检查 Task 1（AgentTool.tsx 路由逻辑）和 Task 2（prompt.ts 文本）的修改

2. 验证 `fork: true` + flag 启用时走 fork 路径
   - `grep -n 'isForkPath = fork === true' packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx`
   - 预期: 找到路由逻辑行，确认 `fork === true && isForkSubagentEnabled()` 条件
   - 失败排查: 检查 Task 1 路由逻辑步骤

3. 验证 `fork` 参数在 flag 关闭时不在 schema 中
   - `grep -n 'omit.*fork' packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx`
   - 预期: 找到 `schema.omit({ fork: true })` 行
   - 失败排查: 检查 Task 1 inputSchema 裁剪逻辑

4. 验证 `forceAsync` 已完全移除，不再绑定 `isForkSubagentEnabled()`
   - `grep -c 'forceAsync' packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx`
   - 预期: 0（无匹配）
   - 失败排查: 检查 Task 1 forceAsync 删除步骤

5. 验证 prompt 中不再引导"省略 subagent_type 触发 fork"
   - `grep -c 'omit.*subagent_type' packages/builtin-tools/src/tools/AgentTool/prompt.ts`
   - 预期: 0（无匹配）
   - `grep -c 'fork: true' packages/builtin-tools/src/tools/AgentTool/prompt.ts`
   - 预期: >= 3（shared section + whenToForkSection + forkExamples）
   - 失败排查: 检查 Task 2 prompt 文本替换步骤

6. 验证后台/同步行为由 `run_in_background` 参数控制
   - `grep -n 'run_in_background' packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx | head -5`
   - 预期: `shouldRunAsync` 计算中包含 `run_in_background === true` 条件，无 `forceAsync` 条件
   - 失败排查: 检查 Task 1 shouldRunAsync 修改步骤
