import { registerBundledSkill } from '../bundledSkills.js'

/**
 * /ultracode — 多 agent workflow 编排工作法（纯知识 prompt skill）。
 *
 * 调用即把 workflow 编排手册注入上下文，零运行时副作用：不改主循环、
 * 不切换行为开关。用户/模型据此判断何时用 Workflow 工具、如何编排、
 * 如何保证质量与可恢复。
 *
 * 通用 skill（非 ant-only），所有用户可用。
 */
const ULTRACODE_PROMPT = `# /ultracode — 多 agent workflow 编排工作法

## 何时用 Workflow 工具

用，当任务满足任一：
- 可**分解 / 并行**（多文件、多维度、可独立推进的子任务）。
- 需要**多视角置信**（如审查：先生成再对抗式验证）。
- **规模超单上下文**（大迁移、广度审计、长尾枚举）。
- 需要 **resume / 可审计**（journal 重放、确定性回放）。

**不要用**：琐碎单文件改、单次问答、一次 Read 能解决的事——直接做。

## 编排原语（workflow 脚本内可用）

- \`agent(prompt, opts?)\` — 派发一个子 agent；返回其最终文本，或（带 \`opts.schema\` 时）schema 校验对象。可在 opts 指定 \`model\`、\`agentType\`、\`label\`、\`phase\`、\`schema\`。
- \`parallel([() => agent(...), ...])\` — 并发跑 thunk 数组，等全部完成。**单项抛错 → 该项变 \`null\`**，其余保留。是 barrier。
- \`pipeline(items, stage1, stage2, …)\` — 每个 item 链式过各 stage；**item 间无 barrier**（item A 可在 stage 3 时 item B 仍在 stage 1），stage 内顺序。单 item 某 stage 抛错 → 该 item \`null\`。
- \`phase(title)\` — 标记阶段（监控面板按此展示进度分组）。
- \`log(msg)\` — 进度日志（面板展示，无状态变更）。
- \`workflow(name | { scriptPath }, args?)\` — 嵌套一层子 workflow（**仅允许一层**）。

## 脚本编写约束（引擎执行模型，违反直接报错）

脚本是 \`new AsyncFunction\` 的**函数体**，不是 ESM 模块，引擎**不转译 TS**。这是脚本报错的首要原因，务必遵守：

- **禁 \`import\`**：\`agent\`/\`parallel\`/\`pipeline\`/\`phase\`/\`log\`/\`workflow\` 与 \`args\`/\`budget\` 是注入的形参，直接用，不 import 任何东西。
- **禁 TS 语法**：不要类型注解（\`x: number\`）、\`interface\`、\`enum\`、\`as\`、泛型——即便文件扩展名是 \`.ts\`，引擎不转译会原样报语法错。**推荐 \`.js\` / \`.mjs\`**。
- **只允许一处 \`export const meta = {...}\`**（纯字面量，引擎正则提取剥离）；不要 \`export\` 其他任何东西，不要 \`export default\`。
- **顶层 \`return\` 返回结果**（函数体内 return 合法且必需）。

\`\`\`js
// .claude/workflows/review-changes.js  ← 纯 JS，无类型注解
export const meta = { name: 'review-changes', description: '按维度审查改动' }

const DIMENSIONS = [{ key: 'bugs' }, { key: 'perf' }]
const results = await pipeline(
  DIMENSIONS,
  d => agent(\`审查 \${d.key}\`, { phase: 'Review' }),
  r => parallel(((r && r.findings) || []).map(f => () => agent(\`验证 \${f}\`))),
)
return results.flat().filter(Boolean)
\`\`\`

## 确定性约束（关键，违反则 resume 失效）

脚本内**禁用** \`Date.now()\` / \`Math.random()\` / 无参 \`new Date()\`（破坏 journal 重放）。
需要时间戳 / 随机种子时，经 \`args\` 传入。\`export const meta = { ... }\` 必须是**纯字面量**（无变量、函数调用、模板插值）。

上限（引擎硬限）：单次 \`parallel\`/\`pipeline\` ≤ **4096** items；单个 workflow 总 **≤ 1000** agent；并发 cap = \`min(16, cores - 2)\`。

## 质量模式（每种给最小片段）

- **Adversarial verify**：\`parallel([() => agent(claim), () => agent(refute)])\`，多数 refute 即弃。
- **Perspective-diverse verify**：同一发现给多个 verifier 不同 lens（正确性 / 安全 / 复现），红队冗余抓不到的失败模式。
- **Judge panel**：N 个独立方案 → 评分 → 取胜者，嫁接亚军亮点。
- **Loop-until-dry**：\`while (fresh.length) { found = await parallel(...); fresh = dedup(found) }\`，连续 K 轮无新增即停。
- **Multi-modal sweep**：多个 agent 各用不同搜索角度（按容器 / 按内容 / 按实体 / 按时间），互不可见。
- **Completeness critic**：末尾一个 agent 问"还缺什么"，其发现成为下一轮工作。

## 后端路由

\`AgentAdapterRegistry\` v1 为单后端（默认 \`claude-code\`）。由后端**内部**按 \`model\` / \`agentType\` 深度解析当前会话的 provider / model / agent 体系（registry 本身可配路由规则，v1 未配，恒落默认）。例：\`agent({ model: 'claude-haiku-4-5', agentType: 'Explore' })\` 经默认后端命中真实 agent 定义。

## resume / budget

- \`resumeFromRunId: '<id>'\` — 重放该 run 的 journal，已完成的 \`agent()\` 秒回缓存结果；首个发散点之后全部现场重跑。
- \`budget.total\` — token 硬顶（默认 \`null\` = 无限）；\`budget.spent()\` / \`budget.remaining()\` 读实时消耗。耗尽后再发 agent 抛错。

## 文件与命令

- 脚本目录：\`.claude/workflows/<name>.ts|.js|.mjs\` → 自动成 \`/<name>\` 命令。
- run 记录：\`.claude/workflow-runs/<runId>/journal.jsonl\`。
- 监控面板：\`/workflows\`（双栏：左 run 列表，右 phase + agent；键位 j/k 选中、r resume、x kill、n 新建提示、q 退出）。
- 工具：\`Workflow\`（input 字段：\`script\` / \`name\` / \`scriptPath\` / \`args\` / \`resumeFromRunId\`）。
`

export function registerUltracodeSkill(): void {
  registerBundledSkill({
    name: 'ultracode',
    description:
      '进入多 agent workflow 编排模式：何时用、编排原语、质量模式、确定性约束、后端路由、resume/budget、文件与命令。',
    whenToUse:
      '任务可分解/并行、需多视角置信、规模超单上下文、或需 resume/可审计时，用 Workflow 工具编排多个子 agent。',
    userInvocable: true,
    async getPromptForCommand(args) {
      let prompt = ULTRACODE_PROMPT
      if (args) {
        prompt += `\n## 用户输入\n\n${args}\n`
      }
      return [{ type: 'text', text: prompt }]
    },
  })
}
