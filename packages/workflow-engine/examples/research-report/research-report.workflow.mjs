// research-report.workflow.mjs
// 技术研究报告 workflow。
// 由 run.ts 通过 @claude-code-best/workflow-engine 的 runWorkflow() 直接执行——
// 不经 Workflow 工具、不经核心 runAgent。脚本内的 agent / parallel / pipeline /
// phase / log / args 均为引擎运行时注入的全局（见 src/engine/script.ts 的沙箱）。
//
// 编排：多角度并行调研（parallel 屏障）→ 逐条深挖（pipeline 无屏障）→ 综合成报告。

export const meta = {
  name: 'research-report',
  description:
    'Multi-angle tech research → deep-read → synthesize into a Markdown report',
  whenToUse: '调研一个技术主题：从多个角度并行研究、逐条深挖、综合成结构化报告',
  phases: [
    { title: 'Research', detail: '多角度并行调研（parallel 屏障）' },
    { title: 'DeepRead', detail: '逐条深挖（pipeline 无屏障）' },
    { title: 'Synthesize', detail: '综合成 Markdown 报告' },
  ],
}

// agent(schema) 让子 agent 返回「校验对象」而非纯文本。
const ANGLE_SCHEMA = {
  type: 'object',
  required: ['angle', 'findings'],
  properties: {
    angle: { type: 'string', description: '本次调研的角度名' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['claim', 'evidence'],
        properties: {
          claim: { type: 'string', description: '一句话结论' },
          evidence: { type: 'string', description: '依据/来源/理由' },
        },
      },
    },
  },
}

const DEEP_SCHEMA = {
  type: 'object',
  required: ['claim', 'analysis', 'confidence'],
  properties: {
    claim: { type: 'string' },
    analysis: { type: 'string', description: '机理/前提/边界/反例' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
}

// ---- 输入（由 run.ts 通过 args 透传）----
const topic = args.topic
if (typeof topic !== 'string' || topic.length === 0) {
  throw new Error('research-report 需要 args.topic（研究主题字符串）')
}
const angles =
  Array.isArray(args.angles) && args.angles.length > 0
    ? args.angles
    : ['核心概念与原理', '主流方案与对比', '工程实践与权衡', '生态与趋势']

// ---- Phase 1：多角度并行调研。parallel = 屏障，等所有角度完成后才继续。----
phase('Research')
log(`主题「${topic}」：${angles.length} 个角度并行调研中`)
const researched = await parallel(
  angles.map(
    a => () =>
      agent(
        `你是资深技术研究分析师。针对技术主题「${topic}」，从「${a}」角度调研，给出该角度下 2-4 条最关键的技术发现，每条须附依据。`,
        { label: `research:${a}`, phase: 'Research', schema: ANGLE_SCHEMA },
      ),
  ),
)
// parallel 返回 (object|null)[]：skipped/dead 的角度为 null，过滤后展平
const allFindings = researched
  .filter(Boolean)
  .flatMap(r => r.findings.map(f => ({ ...f, angle: r.angle })))
log(`收集到 ${allFindings.length} 条发现，进入深挖`)

if (allFindings.length === 0) {
  return {
    topic,
    report: '（所有角度调研均失败，无可用发现）',
    anglesCovered: 0,
    findingsDeepened: 0,
  }
}

// ---- Phase 2：逐条深挖。pipeline = 无屏障，每条发现独立跑完所有 stage，互不等待。----
phase('DeepRead')
const deepened = await pipeline(
  allFindings,
  f =>
    agent(
      `针对以下技术发现，深入分析其机理、成立前提、适用边界与可能的反例：\n结论：${f.claim}\n依据：${f.evidence}\n角度：${f.angle}`,
      { label: `deep:${f.angle}`, phase: 'DeepRead', schema: DEEP_SCHEMA },
    ),
  // 第二个 stage：按置信度标注交叉价值（演示多 stage pipeline 链式传递）。
  // stage-1 若 dead 返回 null，这里显式守卫——避免对 null 取属性（否则被 pipeline
  // 的 per-item catch 吞掉、整条静默丢失）。
  d =>
    d
      ? {
          ...d,
          crossCutting:
            d.confidence === 'high' ? '可作为报告主干' : '需谨慎引用或佐证',
        }
      : null,
)
const deepFindings = deepened.filter(Boolean)
log(`深挖完成 ${deepFindings.length}/${allFindings.length} 条`)

// ---- Phase 3：综合成 Markdown 报告（无 schema → 返回纯文本）----
phase('Synthesize')
const report = await agent(
  `你是首席技术分析师。基于以下经深挖的技术发现，综合一份结构化研究报告（纯 Markdown 叙述）。\n要求：含摘要、分角度分析、关键结论、落地建议与风险；用自然语言陈述每条发现并标注 confidence。\n禁止：在报告中粘贴 JSON 代码块或原样引用下方输入数据。\n\n主题：${topic}\n\n深度发现（JSON，仅供你理解，不要原样输出）：\n${JSON.stringify(deepFindings)}`,
  { label: 'synthesize', phase: 'Synthesize', maxTokens: 8192 },
)

return {
  topic,
  report,
  anglesCovered: angles.length,
  findingsDeepened: deepFindings.length,
}
