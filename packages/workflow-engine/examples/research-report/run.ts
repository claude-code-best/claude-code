/**
 * research-report runner —— 直接用 @claude-code-best/workflow-engine 运行 workflow，
 * 完全绕开 Workflow 工具与核心 runAgent。agent() 后端直连 Anthropic SDK
 * （@anthropic-ai/sdk）：子 agent = 一次 messages.create。
 *
 * 用法：
 *   ANTHROPIC_API_KEY=sk-... \
 *     bun run packages/workflow-engine/examples/research-report/run.ts "Edge Computing"
 *
 * 可选环境变量：
 *   ANTHROPIC_MODEL     模型名，默认 claude-sonnet-4-5
 *   RESEARCH_RUNS_DIR   journal 目录，默认 ~/.claude/workflow-runs（resume 复用）
 */
import Anthropic from '@anthropic-ai/sdk'
import { readFile } from 'node:fs/promises'
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

const SCRIPT_FILE = `${import.meta.dir}/research-report.workflow.mjs`
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5'
const MAX_TOKENS = 4096

// 终端着色（无第三方依赖）
const paint = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
}

// client 由 main() 构造，llmAgent 闭包引用。null 守卫使 import 时不触发真实调用。
const clientRef: { client: Anthropic | null } = { client: null }

// API 并发上限（独立于引擎的 CPU semaphore——LLM API 对并发远比 CPU 敏感，默认 3）。
// 用 WORKFLOW_API_CONCURRENCY 调整。
const apiSem = new Semaphore(
  Math.max(1, Number(process.env.WORKFLOW_API_CONCURRENCY) || 3),
)

/** 429/5xx/连接错误指数退避重试（500ms → 1s → 2s → 4s），最多 4 次。 */
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

/** 精简错误摘要（避免打印整个含 request body 的 message）。 */
function errSummary(e: unknown): string {
  const err = e as {
    status?: number
    error?: { type?: string }
    message?: string
  }
  if (err.status) return `HTTP ${err.status} ${err.error?.type ?? ''}`.trim()
  return (err.message ?? 'unknown').slice(0, 120)
}

/**
 * 真实 LLM agentRunner：一次 messages.create（经 API 并发信号量 + 重试）。
 * schema 模式：prompt 追加 JSON 指令 → 取文本 → 提取 JSON → Ajv 校验 → 失败返回 dead。
 * 非 schema：返回纯文本。
 */
async function llmAgent(params: AgentRunParams): Promise<AgentRunResult> {
  const client = clientRef.client
  if (client === null) return { kind: 'dead' }

  const schemaInstruction = params.schema
    ? '\n\n你必须以一个【单独的 JSON 对象】作为整段回答（不要 Markdown 代码围栏、不要任何解释），该对象须匹配如下 JSON Schema：\n' +
      JSON.stringify(params.schema)
    : ''

  const release = await apiSem.acquire()
  try {
    const resp = await withRetry(() =>
      client.messages.create({
        model: params.model ?? DEFAULT_MODEL,
        max_tokens: params.maxTokens ?? MAX_TOKENS,
        messages: [
          { role: 'user', content: params.prompt + schemaInstruction },
        ],
      }),
    )
    const outputTokens = resp.usage.output_tokens
    const truncated = resp.stop_reason === 'max_tokens'

    if (params.schema) {
      // 截断的 JSON 几乎必然不完整 → 直接判 dead（而非让解析模糊失败）
      if (truncated) return { kind: 'dead' }
      const text = resp.content
        .map(block => (block.type === 'text' ? block.text : ''))
        .join('')
        .trim()
      const parsed = extractJsonObject(text)
      if (parsed === null) return { kind: 'dead' }
      const { valid } = validateAgainstSchema(parsed, params.schema)
      if (!valid) return { kind: 'dead' }
      return { kind: 'ok', output: parsed as object, usage: { outputTokens } }
    }
    const text = resp.content
      .map(block => (block.type === 'text' ? block.text : ''))
      .join('')
      .trim()
    if (truncated) {
      console.error(
        paint.yellow(`  ⚠ 输出被 max_tokens 截断（${outputTokens} tokens）`),
      )
    }
    return { kind: 'ok', output: text, usage: { outputTokens } }
  } catch (e) {
    console.error(paint.red(`  ✗ ${errSummary(e)}`))
    return { kind: 'dead' }
  } finally {
    release()
  }
}

/**
 * 容错 JSON 提取：去代码围栏 → 从首个 { 起做括号深度匹配（跳过字符串字面量与
 * 转义，仿 src/engine/script.ts 的 extractMeta），取配对的 {…} → JSON.parse。
 * 比 lastIndexOf('}') 稳健：正确处理 JSON 后散文里含 }、第二个对象、字符串内 }。
 */
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

/** 内存版 taskRegistrar：不经核心 LocalWorkflowTask，仅维护 runId → AbortController。 */
function makeTaskRegistrar(): WorkflowPorts['taskRegistrar'] {
  const controllers = new Map<string, AbortController>()
  return {
    register(opts) {
      const ac = new AbortController()
      const runId = opts.runId ?? `research-${controllers.size + 1}`
      controllers.set(runId, ac)
      return { runId, signal: ac.signal }
    },
    complete() {},
    fail() {},
    kill(runId) {
      controllers.get(runId)?.abort()
    },
    pendingAction() {
      return null
    },
  }
}

/** 进度事件 → 终端实时打印。 */
function printProgress(e: ProgressEvent): void {
  switch (e.type) {
    case 'run_started':
      console.log(paint.bold(paint.cyan(`\n▶ ${e.workflowName}`)))
      break
    case 'phase_started':
      console.log(paint.cyan(`\n━ phase: ${e.phase}`))
      break
    case 'phase_done':
      break
    case 'agent_started':
      console.log(`  ${paint.dim('→')} ${e.label ?? 'agent'}`)
      break
    case 'agent_done': {
      const tag =
        e.result.kind === 'ok'
          ? paint.green('✓')
          : e.result.kind === 'skipped'
            ? paint.yellow('⊘')
            : paint.red('✗')
      console.log(
        `  ${tag} ${e.label ?? 'agent'} ${paint.dim(`[${e.result.kind}]`)}`,
      )
      break
    }
    case 'log':
      console.log(`  ${paint.dim('·')} ${e.message}`)
      break
    case 'run_done':
      console.log(paint.bold(`\n■ ${e.status}`))
      break
  }
}

/** 组装端口：agent 后端直连 SDK，其余为自包含实现，不触达核心层。 */
function makePorts(runsDir: string): WorkflowPorts {
  return {
    agentRunner: { runAgentToResult: llmAgent },
    progressEmitter: { emit: printProgress },
    taskRegistrar: makeTaskRegistrar(),
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
  const topic = process.argv[2]
  if (!topic) {
    console.error(paint.red('✗ 用法：run.ts <研究主题>'))
    console.error(paint.dim('  例：bun run run.ts "Edge Computing"'))
    process.exit(1)
  }

  clientRef.client = new Anthropic({ logLevel: 'off' })
  const runsDir =
    process.env.RESEARCH_RUNS_DIR ?? join(homedir(), '.claude', 'workflow-runs')
  const script = await readFile(SCRIPT_FILE, 'utf-8')

  const result = await runWorkflow({
    script,
    args: { topic },
    runId: `research-${Date.now()}`,
    ports: makePorts(runsDir),
    host: createHostHandle(null),
    signal: new AbortController().signal,
    cwd: process.cwd(),
    budgetTotal: null,
  })

  if (result.status !== 'completed') {
    console.error(
      paint.red(`✗ workflow ${result.status}：${result.error ?? ''}`),
    )
    process.exit(1)
  }
  const ret = result.returnValue as {
    report?: string
    topic?: string
    anglesCovered?: number
    findingsDeepened?: number
  }
  console.log(
    paint.bold(
      paint.green(`\n════════ 技术研究报告：${ret.topic ?? topic} ════════`),
    ),
  )
  console.log(
    paint.dim(
      `角度数=${ret.anglesCovered ?? '?'} 深挖=${ret.findingsDeepened ?? '?'}`,
    ),
  )
  console.log(ret.report ?? '(无报告输出)')
}

// 仅作为脚本直接运行时启动（import 不触发，便于冒烟/复用端口工厂）
if (import.meta.main) {
  await main()
}
