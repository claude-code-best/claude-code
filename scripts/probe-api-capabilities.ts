#!/usr/bin/env bun
/**
 * API 能力全面探测脚本
 *
 * 用法:
 *   bun run scripts/probe-api-capabilities.ts
 *   bun run scripts/probe-api-capabilities.ts --models-only
 *   bun run scripts/probe-api-capabilities.ts --betas-only
 *
 * 探测内容:
 *   1. 所有已知 beta headers 的接受状态
 *   2. 猜测隐藏的 beta headers
 *   3. 所有已知模型的可用性
 *   4. 猜测未公开的模型 ID
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

// ── 参数 ──────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const modelsOnly = args.includes('--models-only')
const betasOnly = args.includes('--betas-only')
const runAll = !modelsOnly && !betasOnly

// ── 认证 ──────────────────────────────────────────────────────────

function getAuth(): { type: string; headers: Record<string, string> } {
  const credPath = join(homedir(), '.claude', '.credentials.json')
  try {
    const raw = readFileSync(credPath, 'utf8')
    const creds = JSON.parse(raw)
    const token = creds?.claudeAiOauth?.accessToken
    if (token) {
      return {
        type: 'OAuth',
        headers: {
          Authorization: `Bearer ${token}`,
          'anthropic-beta': 'oauth-2025-04-20',
        },
      }
    }
  } catch {}

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (apiKey) {
    return { type: 'API Key', headers: { 'x-api-key': apiKey } }
  }

  console.error('❌ 未找到认证信息')
  process.exit(1)
}

const auth = getAuth()
const API_URL = 'https://api.anthropic.com/v1/messages'
const TEST_MODEL = 'claude-haiku-4-5-20251001' // 便宜的模型用于 beta 测试

// ── 辅助 ──────────────────────────────────────────────────────────

async function apiCall(opts: {
  model: string
  extraBetaHeaders?: string[]
  extraHeaders?: Record<string, string>
}): Promise<{ status: number; error?: string; body?: any }> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'anthropic-version': '2023-06-01',
    ...auth.headers,
    ...(opts.extraHeaders ?? {}),
  }

  // 合并 beta headers
  if (opts.extraBetaHeaders?.length) {
    const existing = headers['anthropic-beta'] ?? ''
    const all = existing
      ? [existing, ...opts.extraBetaHeaders].join(',')
      : opts.extraBetaHeaders.join(',')
    headers['anthropic-beta'] = all
  }

  const body = JSON.stringify({
    model: opts.model,
    max_tokens: 1,
    messages: [{ role: 'user', content: 'hi' }],
  })

  try {
    const resp = await fetch(API_URL, { method: 'POST', headers, body })
    const status = resp.status
    const text = await resp.text()
    let parsed: any
    try {
      parsed = JSON.parse(text)
    } catch {}
    const error = parsed?.error?.message?.slice(0, 300) ?? (status >= 400 ? text.slice(0, 300) : undefined)
    return { status, error, body: parsed }
  } catch (err) {
    return { status: -1, error: String(err).slice(0, 200) }
  }
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── Beta Headers 定义 ─────────────────────────────────────────────

const KNOWN_BETAS = [
  // 代码中的已知常量
  { name: 'claude-code-20250219', source: 'constants/betas.ts' },
  { name: 'interleaved-thinking-2025-05-14', source: 'constants/betas.ts' },
  { name: 'context-1m-2025-08-07', source: 'constants/betas.ts' },
  { name: 'context-management-2025-06-27', source: 'constants/betas.ts' },
  { name: 'structured-outputs-2025-12-15', source: 'constants/betas.ts' },
  { name: 'web-search-2025-03-05', source: 'constants/betas.ts' },
  { name: 'advanced-tool-use-2025-11-20', source: 'constants/betas.ts (TOOL_SEARCH_1P)' },
  { name: 'tool-search-tool-2025-10-19', source: 'constants/betas.ts (TOOL_SEARCH_3P)' },
  { name: 'effort-2025-11-24', source: 'constants/betas.ts' },
  { name: 'task-budgets-2026-03-13', source: 'constants/betas.ts' },
  { name: 'prompt-caching-scope-2026-01-05', source: 'constants/betas.ts' },
  { name: 'fast-mode-2026-02-01', source: 'constants/betas.ts' },
  { name: 'redact-thinking-2026-02-12', source: 'constants/betas.ts' },
  { name: 'token-efficient-tools-2026-03-28', source: 'constants/betas.ts' },
  { name: 'afk-mode-2026-01-31', source: 'constants/betas.ts' },
  { name: 'cli-internal-2026-02-09', source: 'constants/betas.ts' },
  { name: 'advisor-tool-2026-03-01', source: 'constants/betas.ts' },
  { name: 'oauth-2025-04-20', source: 'constants/oauth.ts' },
  // SDK 中引用的
  { name: 'files-api-2025-04-14', source: 'SDK: beta/files.ts' },
  { name: 'token-counting-2024-11-01', source: 'SDK: beta/messages.ts' },
  { name: 'message-batches-2024-09-24', source: 'SDK: beta/messages/batches.ts' },
  { name: 'skills-2025-10-02', source: 'SDK: beta/skills.ts' },
  // 历史版本 / 猜测
  { name: 'prompt-caching-2024-07-31', source: '猜测: 旧版 prompt caching' },
  { name: 'max-tokens-3-5-sonnet-2024-07-15', source: '猜测: 旧版 max tokens' },
  { name: 'computer-use-2024-10-22', source: '猜测: computer use' },
  { name: 'computer-use-2025-01-24', source: '猜测: computer use v2' },
  { name: 'pdfs-2024-09-25', source: '猜测: PDF support' },
  { name: 'analysis-tool-2025-04-15', source: '猜测: analysis tool' },
  { name: 'code-execution-2025-05-14', source: '猜测: code execution' },
  { name: 'mcp-client-2025-04-04', source: '猜测: MCP client' },
  { name: 'extended-thinking-2025-04-15', source: '猜测: extended thinking' },
  // cache editing 猜测
  { name: 'cache-editing-2025-01-01', source: '猜测: cache editing' },
  { name: 'cache-editing-2026-01-01', source: '猜测: cache editing' },
  { name: 'cache-editing-2026-02-01', source: '猜测: cache editing' },
  { name: 'cache-editing-2026-03-01', source: '猜测: cache editing' },
  { name: 'cache-edits-2026-01-01', source: '猜测: cache edits' },
  { name: 'cache-edits-2026-02-01', source: '猜测: cache edits' },
  { name: 'cache-edits-2026-03-01', source: '猜测: cache edits' },
  { name: 'kv-cache-2026-01-01', source: '猜测: kv cache' },
]

// ── 模型定义 ──────────────────────────────────────────────────────

const KNOWN_MODELS = [
  // configs.ts 中的已知模型
  { id: 'claude-3-5-haiku-20241022', family: 'haiku-3.5', source: 'configs.ts' },
  { id: 'claude-haiku-4-5-20251001', family: 'haiku-4.5', source: 'configs.ts' },
  { id: 'claude-3-5-sonnet-20241022', family: 'sonnet-3.5v2', source: 'configs.ts' },
  { id: 'claude-3-7-sonnet-20250219', family: 'sonnet-3.7', source: 'configs.ts' },
  { id: 'claude-sonnet-4-20250514', family: 'sonnet-4.0', source: 'configs.ts' },
  { id: 'claude-sonnet-4-5-20250929', family: 'sonnet-4.5', source: 'configs.ts' },
  { id: 'claude-sonnet-4-6', family: 'sonnet-4.6', source: 'configs.ts' },
  { id: 'claude-opus-4-20250514', family: 'opus-4.0', source: 'configs.ts' },
  { id: 'claude-opus-4-1-20250805', family: 'opus-4.1', source: 'configs.ts' },
  { id: 'claude-opus-4-5-20251101', family: 'opus-4.5', source: 'configs.ts' },
  { id: 'claude-opus-4-6', family: 'opus-4.6', source: 'configs.ts' },
]

const GUESSED_MODELS = [
  // 旧模型
  { id: 'claude-3-opus-20240229', family: 'opus-3', source: '猜测: 旧版 opus' },
  { id: 'claude-3-sonnet-20240229', family: 'sonnet-3', source: '猜测: 旧版 sonnet' },
  { id: 'claude-3-haiku-20240307', family: 'haiku-3', source: '猜测: 旧版 haiku' },
  // 别名
  { id: 'claude-sonnet-4-6-20260131', family: 'sonnet-4.6-dated', source: '猜测: dated ID' },
  { id: 'claude-opus-4-6-20260131', family: 'opus-4.6-dated', source: '猜测: dated ID' },
  // 未来模型猜测
  { id: 'claude-sonnet-4-7', family: 'sonnet-4.7', source: '猜测: 下一代 sonnet' },
  { id: 'claude-opus-4-7', family: 'opus-4.7', source: '猜测: 下一代 opus' },
  { id: 'claude-haiku-4-6', family: 'haiku-4.6', source: '猜测: 下一代 haiku' },
  { id: 'claude-haiku-4-5', family: 'haiku-4.5-short', source: '猜测: haiku 无日期' },
  // 代码中提到的内部模型
  { id: 'claude-strudel', family: 'strudel', source: '代码引用: betas.ts' },
  { id: 'claude-strudel-eap', family: 'strudel-eap', source: '代码引用: claude.ts:465' },
  { id: 'claude-strudel-v6-p', family: 'strudel-v6-p', source: '代码引用: betas.ts:168' },
  // 1M 变体
  { id: 'claude-sonnet-4-6[1m]', family: 'sonnet-4.6-1m', source: '猜测: 1M context' },
  { id: 'claude-opus-4-6[1m]', family: 'opus-4.6-1m', source: '猜测: 1M context' },
  // 旧版 opus 变体
  { id: 'claude-opus-4-0', family: 'opus-4.0-alias', source: '代码引用: migrations' },
  { id: 'claude-opus-4-1', family: 'opus-4.1-alias', source: '代码引用: migrations' },
  // latest 别名
  { id: 'claude-sonnet-latest', family: 'sonnet-latest', source: '猜测: latest alias' },
  { id: 'claude-opus-latest', family: 'opus-latest', source: '猜测: latest alias' },
  { id: 'claude-haiku-latest', family: 'haiku-latest', source: '猜测: latest alias' },
]

// ── 主程序 ────────────────────────────────────────────────────────

console.log()
console.log('╔═════════════════════════════════════════════════════════════╗')
console.log('║            API 能力全面探测                                 ║')
console.log('╠═════════════════════════════════════════════════════════════╣')
console.log(`║ 认证: ${auth.type.padEnd(53)}║`)
console.log(`║ 时间: ${new Date().toISOString().padEnd(53)}║`)
console.log('╚═════════════════════════════════════════════════════════════╝')

// ── Part 1: Beta Headers ──────────────────────────────────────────

if (runAll || betasOnly) {
  console.log()
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  PART 1: Beta Headers 探测')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log()

  const betaResults: Array<{
    name: string
    source: string
    status: number
    accepted: boolean
    error?: string
  }> = []

  for (const beta of KNOWN_BETAS) {
    // 跳过 oauth（已在基线中）
    if (beta.name === 'oauth-2025-04-20' && auth.type === 'OAuth') {
      betaResults.push({ name: beta.name, source: beta.source, status: 200, accepted: true })
      console.log(`⏭️  ${beta.name.padEnd(45)} (OAuth 基线)`)
      continue
    }

    const result = await apiCall({
      model: TEST_MODEL,
      extraBetaHeaders: [beta.name],
    })

    const isBetaRejection = result.status === 400 && (result.error?.includes('anthropic-beta') ?? false)
    const accepted = !isBetaRejection && result.status < 400

    betaResults.push({
      name: beta.name,
      source: beta.source,
      status: result.status,
      accepted,
      error: result.error,
    })

    const icon = accepted ? '✅' : '❌'
    console.log(`${icon} ${beta.name.padEnd(45)} [${beta.source}]`)
    if (!accepted && result.error) {
      const shortErr = result.error.slice(0, 100)
      console.log(`   └─ ${result.status}: ${shortErr}`)
    }

    await delay(100) // 限流
  }

  // 汇总
  const acceptedBetas = betaResults.filter(r => r.accepted)
  const rejectedBetas = betaResults.filter(r => !r.accepted)

  console.log()
  console.log('── Beta Headers 汇总 ──')
  console.log()
  console.log(`✅ 接受 (${acceptedBetas.length}):`)
  for (const b of acceptedBetas) {
    console.log(`   ${b.name}`)
  }
  console.log()
  console.log(`❌ 拒绝 (${rejectedBetas.length}):`)
  for (const b of rejectedBetas) {
    console.log(`   ${b.name}  [${b.source}]`)
  }
}

// ── Part 2: 模型探测 ─────────────────────────────────────────────

if (runAll || modelsOnly) {
  console.log()
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  PART 2: 模型可用性探测')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const allModels = [...KNOWN_MODELS, ...GUESSED_MODELS]
  const modelResults: Array<{
    id: string
    family: string
    source: string
    status: number
    available: boolean
    error?: string
    stopReason?: string
  }> = []

  console.log()
  console.log('─── 已知模型 (configs.ts) ───')
  console.log()

  for (const model of KNOWN_MODELS) {
    const result = await apiCall({ model: model.id })
    const available = result.status === 200
    const stopReason = result.body?.stop_reason

    modelResults.push({
      id: model.id,
      family: model.family,
      source: model.source,
      status: result.status,
      available,
      error: result.error,
      stopReason,
    })

    const icon = available ? '✅' : '❌'
    const extra = available && stopReason ? ` (stop: ${stopReason})` : ''
    console.log(`${icon} ${model.id.padEnd(42)} ${model.family}${extra}`)
    if (!available && result.error) {
      const shortErr = result.error.slice(0, 120)
      console.log(`   └─ ${result.status}: ${shortErr}`)
    }

    await delay(200)
  }

  console.log()
  console.log('─── 猜测的模型 ───')
  console.log()

  for (const model of GUESSED_MODELS) {
    const result = await apiCall({ model: model.id })
    const available = result.status === 200
    const stopReason = result.body?.stop_reason

    modelResults.push({
      id: model.id,
      family: model.family,
      source: model.source,
      status: result.status,
      available,
      error: result.error,
      stopReason,
    })

    const icon = available ? '🎯' : (result.status === 400 ? '❌' : '⚠️')
    const extra = available && stopReason ? ` (stop: ${stopReason})` : ''
    console.log(`${icon} ${model.id.padEnd(42)} ${model.family}${extra}`)
    if (!available) {
      const shortErr = result.error?.slice(0, 120) ?? ''
      console.log(`   └─ ${result.status}: ${shortErr}`)
    }

    await delay(200)
  }

  // 汇总
  const availableModels = modelResults.filter(r => r.available)
  const unavailableModels = modelResults.filter(r => !r.available)

  console.log()
  console.log('── 模型汇总 ──')
  console.log()
  console.log(`✅ 可用 (${availableModels.length}):`)
  for (const m of availableModels) {
    console.log(`   ${m.id.padEnd(45)} ${m.family}`)
  }
  console.log()
  console.log(`❌ 不可用 (${unavailableModels.length}):`)
  for (const m of unavailableModels) {
    const reason = m.status === 404 ? 'not found'
      : m.status === 400 ? 'invalid'
      : m.status === 403 ? 'forbidden'
      : m.status === 529 ? 'overloaded'
      : `status ${m.status}`
    console.log(`   ${m.id.padEnd(45)} ${m.family.padEnd(20)} (${reason})`)
  }
}

console.log()
console.log('═════════════════════════════════════════════════════════════')
console.log('完成。')
console.log()
