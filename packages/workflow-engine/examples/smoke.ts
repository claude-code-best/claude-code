/**
 * 冒烟端到端入口 —— 真实 SDK + 引擎，最小验证端到端通路。
 * 3 次模型调用（2 角度并行 schema + 1 综合），秒级完成、低成本。
 * 覆盖：runWorkflow、parallel（屏障）、agent(schema) 结构化、agent 文本、进度事件。
 *
 * 用法：
 *   ANTHROPIC_API_KEY=sk-... \
 *     bun run packages/workflow-engine/examples/smoke.ts
 *
 * 可选：ANTHROPIC_MODEL（默认 claude-sonnet-4-5）
 */
import Anthropic from '@anthropic-ai/sdk'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  createFileJournalStore,
  createHostHandle,
  runWorkflow,
  Semaphore,
  validateAgainstSchema,
  type AgentRunParams,
  type AgentRunResult,
  type ProgressEvent,
  type WorkflowPorts,
} from '@claude-code-best/workflow-engine'

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5'
const clientRef: { client: Anthropic | null } = { client: null }

const POINT_SCHEMA = {
  type: 'object',
  required: ['point'],
  properties: { point: { type: 'string' } },
}

// 最小 workflow：2 角度并行（schema 结构化）→ 综合（文本）。脚本内用 + 拼接避免 ${}。
const SMOKE_SCRIPT =
  `
export const meta = { name: 'smoke', description: 'minimal end-to-end smoke' }
phase('Smoke')
const angles = ['一句话定义', '一个最核心价值']
const points = await parallel(
  angles.map(a => () =>
    agent('用简短一句话（30 字内）说明 workflow 编排的「' + a + '」。', {
      label: 'p:' + a,
      schema: ` +
  JSON.stringify(POINT_SCHEMA) +
  `,
    }),
  ),
)
const clean = points.filter(Boolean)
const joined = clean.map(p => p.point).join('；')
const summary = await agent('把以下要点综合成一句中文结论。要点：' + joined, {
  label: 'summary',
})
return { points: clean, summary }
`

// API 并发上限（独立于引擎的 CPU semaphore——LLM API 对并发远比 CPU 敏感，默认 3）。
const apiSem = new Semaphore(
  Math.max(1, Number(process.env.WORKFLOW_API_CONCURRENCY) || 3),
)

/** 429/5xx/连接错误指数退避重试，最多 4 次。 */
async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (e) {
      if (!isRetryable(e) || attempt >= retries) throw e
      const wait = Math.min(500 * 2 ** attempt, 8000)
      await new Promise(r => {
        setTimeout(r, wait)
      })
    }
  }
}

function isRetryable(e: unknown): boolean {
  const err = e as { status?: number; name?: string }
  if (err.status === 429) return true
  if (typeof err.status === 'number' && err.status >= 500) return true
  if (typeof err.name === 'string' && /Connection|Timeout/i.test(err.name)) {
    return true
  }
  return false
}

function errSummary(e: unknown): string {
  const err = e as {
    status?: number
    error?: { type?: string }
    message?: string
  }
  if (err.status) return `HTTP ${err.status} ${err.error?.type ?? ''}`.trim()
  return (err.message ?? 'unknown').slice(0, 120)
}

async function llmAgent(params: AgentRunParams): Promise<AgentRunResult> {
  const client = clientRef.client
  if (client === null) return { kind: 'dead' }
  const schemaInstruction = params.schema
    ? '\n\n以单独 JSON 对象回答（无围栏无解释），匹配 schema：\n' +
      JSON.stringify(params.schema)
    : ''
  const release = await apiSem.acquire()
  try {
    const resp = await withRetry(() =>
      client.messages.create({
        model: params.model ?? DEFAULT_MODEL,
        max_tokens: params.maxTokens ?? 1024,
        messages: [
          { role: 'user', content: params.prompt + schemaInstruction },
        ],
      }),
    )
    const outputTokens = resp.usage.output_tokens
    if (resp.stop_reason === 'max_tokens') return { kind: 'dead' }
    const text = resp.content
      .map(block => (block.type === 'text' ? block.text : ''))
      .join('')
      .trim()
    if (params.schema) {
      const parsed = extractJsonObject(text)
      if (parsed === null) return { kind: 'dead' }
      if (!validateAgainstSchema(parsed, params.schema).valid) {
        return { kind: 'dead' }
      }
      return { kind: 'ok', output: parsed as object, usage: { outputTokens } }
    }
    return { kind: 'ok', output: text, usage: { outputTokens } }
  } catch (e) {
    console.error(`  ✗ ${errSummary(e)}`)
    return { kind: 'dead' }
  } finally {
    release()
  }
}

function extractJsonObject(text: string): unknown | null {
  const stripped = text.replace(/```(?:json)?/gi, '').trim()
  const start = stripped.indexOf('{')
  if (start < 0) {
    try {
      return JSON.parse(stripped)
    } catch {
      return null
    }
  }
  let depth = 0
  let inStr: string | null = null
  for (let i = start; i < stripped.length; i++) {
    const ch = stripped[i]
    if (inStr) {
      if (ch === '\\') i++
      else if (ch === inStr) inStr = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') inStr = ch
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(stripped.slice(start, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

function makePorts(runsDir: string): WorkflowPorts {
  return {
    agentRunner: { runAgentToResult: llmAgent },
    progressEmitter: {
      emit: (e: ProgressEvent) => {
        if (e.type === 'phase_started') console.log(`\n━ phase: ${e.phase}`)
        else if (e.type === 'agent_started')
          console.log(`  → ${e.label ?? 'agent'}`)
        else if (e.type === 'agent_done')
          console.log(
            `  ${e.result.kind === 'ok' ? '✓' : '✗'} ${e.label ?? ''} [${e.result.kind}]`,
          )
        else if (e.type === 'log') console.log(`  · ${e.message}`)
      },
    },
    taskRegistrar: {
      register: () => ({
        runId: 'smoke',
        signal: new AbortController().signal,
      }),
      complete() {},
      fail() {},
      kill() {},
      pendingAction: () => null,
    },
    journalStore: createFileJournalStore(runsDir),
    permissionGate: { isAborted: () => false },
    logger: { debug: () => {}, event: () => {} },
    hostFactory: () => ({
      handle: createHostHandle(null),
      cwd: process.cwd(),
      budgetTotal: null,
    }),
  }
}

async function main(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('✗ 缺少 ANTHROPIC_API_KEY 环境变量')
    process.exit(1)
  }
  clientRef.client = new Anthropic({ apiKey, logLevel: 'off' })
  const runsDir =
    process.env.RESEARCH_RUNS_DIR ?? join(homedir(), '.claude', 'workflow-runs')

  const result = await runWorkflow({
    script: SMOKE_SCRIPT,
    args: {},
    runId: `smoke-${Date.now()}`,
    ports: makePorts(runsDir),
    host: createHostHandle(null),
    signal: new AbortController().signal,
    cwd: process.cwd(),
    budgetTotal: null,
  })

  if (result.status !== 'completed') {
    console.error(`\n✗ FAIL：${result.status} ${result.error ?? ''}`)
    process.exit(1)
  }
  const ret = result.returnValue as {
    points: Array<{ point: string }>
    summary: string
  }
  console.log('\n━━━━━━━━ 冒烟结果 ━━━━━━━━')
  for (const p of ret.points) console.log(`• ${p.point}`)
  console.log(`\n综合：${ret.summary}`)
  console.log(
    `\n✓ PASS：端到端通路正常（${ret.points.length} 要点 + 综合，3 次模型调用）`,
  )
}

if (import.meta.main) {
  await main()
}
