# Fork Agent 显式参数触发重构 人工验收清单

**生成时间:** 2026-05-02
**关联计划:** spec/feature_20260502_F001_fork-agent-redesign/spec-plan.md
**关联设计:** spec/feature_20260502_F001_fork-agent-redesign/spec-design.md

---

## 验收前准备

### 环境要求
- [ ] [AUTO] 检查 Bun 版本: `bun --version`
- [ ] [AUTO] 安装依赖: `bun install`

---

## 验收项目

### 场景 1：Schema 与类型变更

#### - [x] 1.1 fork 字段已添加到 baseInputSchema
- **来源:** spec-plan.md Task 1 / spec-design.md §Schema 变更
- **目的:** 确认 fork 参数在基础 schema 中声明
- **操作步骤:**
  1. [A] `grep -n 'fork:' packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx | head -5` → 期望包含: `fork: z`（schema 定义）和 `fork?: boolean`（类型声明）

#### - [x] 1.2 fork 字段在 flag 关闭时被 schema 裁剪
- **来源:** spec-plan.md Task 1 / spec-design.md §Schema 变更
- **目的:** 确认 FORK_SUBAGENT 关闭时 fork 字段不可见
- **操作步骤:**
  1. [A] `grep -n 'omit.*fork' packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx` → 期望包含: `schema.omit({ fork: true })`

#### - [x] 1.3 AgentToolInput 类型包含 fork 字段
- **来源:** spec-plan.md Task 1
- **目的:** 确认类型声明与 schema 一致
- **操作步骤:**
  1. [A] `grep -n 'fork' packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx | grep 'AgentToolInput\|fork?:'` → 期望包含: `fork?: boolean`

---

### 场景 2：路由逻辑重构

#### - [x] 2.1 isForkPath 使用显式 fork 参数判断
- **来源:** spec-plan.md Task 1 / spec-design.md §路由逻辑重构
- **目的:** 确认 fork 路径由 fork=true 显式触发
- **操作步骤:**
  1. [A] `grep -n 'isForkPath' packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx` → 期望包含: `fork === true && isForkSubagentEnabled()`

#### - [x] 2.2 forceAsync 已完全移除
- **来源:** spec-plan.md Task 1 / spec-design.md §后台运行由参数决定
- **目的:** 确认 forceAsync 不再绑定 isForkSubagentEnabled()
- **操作步骤:**
  1. [A] `grep -c 'forceAsync' packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx` → 期望精确: `0`

#### - [x] 2.3 isForkSubagentEnabled() 仅用于 schema 裁剪和路由判断
- **来源:** spec-plan.md Task 1
- **目的:** 确认 isForkSubagentEnabled() 不再影响 forceAsync/shouldRunAsync
- **操作步骤:**
  1. [A] `grep -n 'isForkSubagentEnabled' packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx` → 期望包含: 仅出现在 inputSchema 裁剪和 isForkPath 路由判断中

#### - [x] 2.4 shouldRunAsync 由 run_in_background 控制
- **来源:** spec-plan.md Task 1 / spec-design.md §后台运行由参数决定
- **目的:** 确认异步行为与普通 agent 一致
- **操作步骤:**
  1. [A] `grep -n 'run_in_background' packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx | head -5` → 期望包含: `shouldRunAsync` 计算中含 `run_in_background === true`，无 `forceAsync`

#### - [x] 2.5 enableSummarization 使用 isForkPath 而非 isForkSubagentEnabled()
- **来源:** spec-plan.md Task 1
- **目的:** 确认摘要仅在当前调用实际走 fork 路径时启用
- **操作步骤:**
  1. [A] `grep -n 'enableSummarization' packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx` → 期望包含: `isForkPath`，不包含 `isForkSubagentEnabled()`

---

### 场景 3：Prompt 文本更新

#### - [x] 3.1 不再包含 "omit subagent_type" 引导文本
- **来源:** spec-plan.md Task 2 / spec-design.md §prompt 调整
- **目的:** 确认隐式 fork 触发引导已移除
- **操作步骤:**
  1. [A] `grep -c 'omit' packages/builtin-tools/src/tools/AgentTool/prompt.ts` → 期望精确: `0`

#### - [x] 3.2 包含 "fork: true" 显式参数说明
- **来源:** spec-plan.md Task 2 / spec-design.md §prompt 调整
- **目的:** 确认新的显式 fork 使用说明已写入
- **操作步骤:**
  1. [A] `grep -c 'fork: true' packages/builtin-tools/src/tools/AgentTool/prompt.ts` → 期望包含: >= 3（shared section + whenToForkSection + forkExamples）

#### - [x] 3.3 背景任务说明条件不再含 !forkEnabled
- **来源:** spec-plan.md Task 2
- **目的:** 确认 fork 解耦后背景任务说明在 fork 启用时也显示
- **操作步骤:**
  1. [A] `grep -n 'forkEnabled' packages/builtin-tools/src/tools/AgentTool/prompt.ts` → 期望包含: 所有匹配行均为 `forkEnabled ?` 形式，不包含 `!forkEnabled`

#### - [x] 3.4 术语从 "fresh agent" 更新为 "non-fork"
- **来源:** spec-plan.md Task 2
- **目的:** 确认 prompt 术语与新的显式 fork 逻辑一致
- **操作步骤:**
  1. [A] `grep -c 'non-fork' packages/builtin-tools/src/tools/AgentTool/prompt.ts` → 期望包含: >= 2

---

### 场景 4：边界与回归（决策表验证）

#### - [x] 4.1 fork=true + subagent_type + flag 开 → fork 路径，忽略 subagent_type
- **来源:** spec-design.md §决策表 + spec-plan.md Task 3
- **目的:** 确认 fork 优先级高于 subagent_type
- **操作步骤:**
  1. [A] `grep -A2 'isForkPath = fork === true' packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx` → 期望包含: `effectiveType = subagent_type ?? GENERAL_PURPOSE_AGENT.agentType`（fork 生效时 effectiveType 被 isForkPath 覆盖，subagent_type 不影响路由）

#### - [x] 4.2 fork=true + flag 关闭 → 忽略 fork，走普通 agent 路径
- **来源:** spec-design.md §决策表
- **目的:** 确认 flag 关闭时 fork 静默降级
- **操作步骤:**
  1. [A] `grep 'isForkPath = fork === true && isForkSubagentEnabled' packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx` → 期望包含: `&& isForkSubagentEnabled()`（双条件确保 flag 关闭时 isForkPath 为 false）

#### - [x] 4.3 fork 省略 → 走 general-purpose 或指定 subagent_type
- **来源:** spec-design.md §决策表
- **目的:** 确认向后兼容
- **操作步骤:**
  1. [A] `grep 'effectiveType = subagent_type ??' packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx` → 期望包含: `GENERAL_PURPOSE_AGENT.agentType`

---

### 场景 5：defines.ts 注释与构建验证

#### - [x] 5.1 FORK_SUBAGENT 注释已更新为新行为描述
- **来源:** spec-plan.md Task 1 / spec-design.md §实现要点
- **目的:** 确认注释反映显式参数触发设计
- **操作步骤:**
  1. [A] `grep 'FORK_SUBAGENT' scripts/defines.ts` → 期望包含: `显式 \`fork: true\` 参数触发`

#### - [x] 5.2 单元测试全部通过
- **来源:** spec-plan.md Task 1 + Task 2
- **目的:** 确认路由逻辑和 prompt 文本测试通过
- **操作步骤:**
  1. [A] `bun test packages/builtin-tools/src/tools/AgentTool/__tests__/ 2>&1 | tail -10` → 期望包含: `0 fail`

#### - [x] 5.3 precheck 零错误通过
- **来源:** spec-plan.md Task 3 / spec-design.md §验收标准
- **目的:** 确认 typecheck + lint + test 无回归
- **操作步骤:**
  1. [A] `bun run precheck` → 期望包含: 零错误退出

---

## 验收结果汇总

| 场景 | 序号 | 验收项 | [A] | [H] | 结果 |
|------|------|--------|-----|-----|------|
| 场景 1 | 1.1 | fork 字段已添加到 baseInputSchema | 1 | 0 | ✅ |
| 场景 1 | 1.2 | fork 字段在 flag 关闭时被 schema 裁剪 | 1 | 0 | ✅ |
| 场景 1 | 1.3 | AgentToolInput 类型包含 fork 字段 | 1 | 0 | ✅ |
| 场景 2 | 2.1 | isForkPath 使用显式 fork 参数判断 | 1 | 0 | ✅ |
| 场景 2 | 2.2 | forceAsync 已完全移除 | 1 | 0 | ✅ |
| 场景 2 | 2.3 | isForkSubagentEnabled() 仅用于 schema 裁剪和路由判断 | 1 | 0 | ✅ |
| 场景 2 | 2.4 | shouldRunAsync 由 run_in_background 控制 | 1 | 0 | ✅ |
| 场景 2 | 2.5 | enableSummarization 使用 isForkPath | 1 | 0 | ✅ |
| 场景 3 | 3.1 | 不再包含 "omit subagent_type" 引导文本 | 1 | 0 | ✅ |
| 场景 3 | 3.2 | 包含 "fork: true" 显式参数说明 | 1 | 0 | ✅ |
| 场景 3 | 3.3 | 背景任务条件不再含 !forkEnabled | 1 | 0 | ✅ |
| 场景 3 | 3.4 | 术语更新为 "non-fork" | 1 | 0 | ✅ |
| 场景 4 | 4.1 | fork=true + subagent_type + flag 开 → fork 路径 | 1 | 0 | ✅ |
| 场景 4 | 4.2 | fork=true + flag 关闭 → 忽略 fork | 1 | 0 | ✅ |
| 场景 4 | 4.3 | fork 省略 → general-purpose（向后兼容） | 1 | 0 | ✅ |
| 场景 5 | 5.1 | FORK_SUBAGENT 注释已更新 | 1 | 0 | ✅ |
| 场景 5 | 5.2 | 单元测试全部通过 | 1 | 0 | ✅ |
| 场景 5 | 5.3 | precheck 零错误通过 | 1 | 0 | ✅ |

**验收结论:** ✅ 全部通过 / ⬜ 存在问题
