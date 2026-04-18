#!/usr/bin/env bun
/**
 * 针对性 API 探测 — Max 用户专属
 *
 * 修正上次探测的问题：
 * 1. context-1m 用 Sonnet 测试（Haiku 不支持 1M）
 * 2. 模型测试加大延迟避免 429
 * 3. 补充更多 beta 猜测
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

// ── 认证 ──────────────────────────────────────────────────────────

function getAuth() {
  const credPath = join(homedir(), '.claude', '.credentials.json')
  try {
    const raw = readFileSync(credPath, 'utf8')
    const creds = JSON.parse(raw)
    const token = creds?.claudeAiOauth?.accessToken
    if (token) {
      return {
        type: 'OAuth (Max)',
        headers: {
          Authorization: `Bearer ${token}`,
          'anthropic-beta': 'oauth-2025-04-20',
        },
      }
    }
  } catch {}
  console.error('❌ 未找到 OAuth token')
  process.exit(1)
}

const auth = getAuth()
const API_URL = 'https://api.anthropic.com/v1/messages'

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function apiCall(model: string, extraBetas?: string[]): Promise<{
  status: number; error?: string; body?: any; model: string
}> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'anthropic-version': '2023-06-01',
    ...auth.headers,
  }
  if (extraBetas?.length) {
    headers['anthropic-beta'] = [headers['anthropic-beta'], ...extraBetas].filter(Boolean).join(',')
  }
  try {
    const resp = await fetch(API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
    })
    const text = await resp.text()
    let parsed: any
    try { parsed = JSON.parse(text) } catch {}
    return {
      status: resp.status,
      error: parsed?.error?.message?.slice(0, 300) ?? (resp.status >= 400 ? text.slice(0, 300) : undefined),
      body: parsed,
      model,
    }
  } catch (err) {
    return { status: -1, error: String(err).slice(0, 200), model }
  }
}

// ── 主程序 ────────────────────────────────────────────────────────

console.log()
console.log('╔═══════════════════════════════════════════════════════════════╗')
console.log('║       API 针对性探测 (Max 用户)                               ║')
console.log('╠═══════════════════════════════════════════════════════════════╣')
console.log(`║ 时间: ${new Date().toISOString().padEnd(55)}║`)
console.log('╚═══════════════════════════════════════════════════════════════╝')

// ── Part 1: 模型可用性（加大延迟）─────────────────────────────────

console.log()
console.log('━━━ Part 1: 模型可用性（每个请求间隔 2 秒避免 429）━━━')
console.log()

const models = [
  // 当前代的主力
  { id: 'claude-haiku-4-5-20251001', note: 'Haiku 4.5 (完整 ID)' },
  { id: 'claude-haiku-4-5', note: 'Haiku 4.5 (短 ID)' },
  { id: 'claude-sonnet-4-6', note: 'Sonnet 4.6' },
  { id: 'claude-opus-4-6', note: 'Opus 4.6' },
  // 上一代
  { id: 'claude-sonnet-4-5-20250929', note: 'Sonnet 4.5' },
  { id: 'claude-opus-4-5-20251101', note: 'Opus 4.5' },
  { id: 'claude-sonnet-4-5', note: 'Sonnet 4.5 (短 ID)' },
  { id: 'claude-opus-4-5', note: 'Opus 4.5 (短 ID)' },
  // 更早的
  { id: 'claude-sonnet-4-20250514', note: 'Sonnet 4.0' },
  { id: 'claude-opus-4-20250514', note: 'Opus 4.0' },
  { id: 'claude-opus-4-1-20250805', note: 'Opus 4.1' },
  // 短别名
  { id: 'claude-opus-4-0', note: 'Opus 4.0 (短别名)' },
  { id: 'claude-opus-4-1', note: 'Opus 4.1 (短别名)' },
  // Claude 3 系列
  { id: 'claude-3-haiku-20240307', note: 'Haiku 3 (旧版)' },
  { id: 'claude-3-5-haiku-20241022', note: 'Haiku 3.5' },
  { id: 'claude-3-5-sonnet-20241022', note: 'Sonnet 3.5 v2' },
  { id: 'claude-3-7-sonnet-20250219', note: 'Sonnet 3.7' },
  { id: 'claude-3-opus-20240229', note: 'Opus 3' },
  // 猜测的隐藏别名
  { id: 'claude-sonnet-4', note: '猜测: sonnet-4 短别名' },
  { id: 'claude-opus-4', note: '猜测: opus-4 短别名' },
  { id: 'claude-haiku-4', note: '猜测: haiku-4 短别名' },
  { id: 'claude-haiku-3-5', note: '猜测: haiku-3-5 短别名' },
  { id: 'claude-sonnet-3-5', note: '猜测: sonnet-3-5 短别名' },
  { id: 'claude-sonnet-3-7', note: '猜测: sonnet-3-7 短别名' },
]

const modelResults: Array<{ id: string; note: string; status: number; stopReason?: string; error?: string }> = []

for (const m of models) {
  const r = await apiCall(m.id)
  const stopReason = r.body?.stop_reason
  modelResults.push({ id: m.id, note: m.note, status: r.status, stopReason, error: r.error })

  const icon = r.status === 200 ? '✅'
    : r.status === 429 ? '⚡'
    : r.status === 404 ? '❌'
    : '⚠️'
  const extra = r.status === 200 ? ` (stop: ${stopReason})`
    : r.status === 429 ? ' (429 限流 — 模型存在但被限速)'
    : r.status === 404 ? ' (404 不存在)'
    : ` (${r.status})`
  console.log(`${icon} ${m.id.padEnd(40)} ${m.note}${extra}`)
  if (r.error && r.status !== 429 && r.status !== 200) {
    console.log(`   └─ ${r.error.slice(0, 150)}`)
  }

  await delay(2000) // 2 秒间隔
}

// ── Part 2: context-1m 用 Sonnet 重测 ─────────────────────────────

console.log()
console.log('━━━ Part 2: context-1m beta 用 Sonnet 重测 ━━━')
console.log()

const context1mTests = [
  { model: 'claude-haiku-4-5-20251001', beta: 'context-1m-2025-08-07', note: 'Haiku (不支持 1M)' },
  { model: 'claude-sonnet-4-6', beta: 'context-1m-2025-08-07', note: 'Sonnet 4.6 (应该支持)' },
  { model: 'claude-opus-4-6', beta: 'context-1m-2025-08-07', note: 'Opus 4.6 (应该支持)' },
]

for (const t of context1mTests) {
  const r = await apiCall(t.model, [t.beta])
  const icon = r.status === 200 ? '✅' : '❌'
  console.log(`${icon} ${t.note.padEnd(35)} → ${r.status}`)
  if (r.error) console.log(`   └─ ${r.error.slice(0, 200)}`)
  await delay(2000)
}

// ── Part 3: 上次被拒的 beta 用 Sonnet 重测 ────────────────────────

console.log()
console.log('━━━ Part 3: 上次被拒的 beta 用 Sonnet 重测 ━━━')
console.log()

const rejectedBetaRetests = [
  'task-budgets-2026-03-13',
  'afk-mode-2026-01-31',
  'skills-2025-10-02',
]

for (const beta of rejectedBetaRetests) {
  // 先等一下避免 429
  await delay(2000)
  const r = await apiCall('claude-sonnet-4-6', [beta])
  const icon = r.status === 200 ? '✅' : (r.status === 429 ? '⚡' : '❌')
  console.log(`${icon} ${beta.padEnd(40)} → ${r.status}`)
  if (r.error && r.status !== 429) console.log(`   └─ ${r.error.slice(0, 200)}`)
}

// ── Part 4: 额外的 beta 猜测 ─────────────────────────────────────

console.log()
console.log('━━━ Part 4: 额外 beta 猜测 ━━━')
console.log()

const extraGuesses = [
  // 更多日期变体
  'cache-editing-2026-04-01',
  'cache-editing-2026-04-15',
  'cache-control-2025-01-01',
  'cache-control-2026-01-01',
  'cached-mc-2026-01-01',
  'microcompact-2026-01-01',
  'kv-deletion-2026-01-01',
  'cache-delete-2026-01-01',
  // 其他可能的隐藏 beta
  'citations-2024-11-15',
  'citations-2025-01-01',
  'grounding-2025-01-01',
  'memory-2025-01-01',
  'memory-2026-01-01',
  'agents-2025-01-01',
  'agents-2026-01-01',
  'multi-turn-tool-use-2024-10-23',
  'output-128k-2025-02-19',
  'interleaved-thinking-2025-01-24',
  'thinking-2025-04-15',
  'long-context-2025-01-01',
  'long-output-2025-01-01',
]

for (const beta of extraGuesses) {
  const r = await apiCall('claude-haiku-4-5-20251001', [beta])
  const isBetaRejection = r.status === 400 && (r.error?.includes('anthropic-beta') ?? false)
  const accepted = !isBetaRejection && r.status < 400
  const icon = accepted ? '🎯' : '❌'
  console.log(`${icon} ${beta}`)
  if (accepted && r.status === 200) {
    console.log(`   └─ ✅ API 接受了！`)
  }
  await delay(300)
}

// ── 汇总 ──────────────────────────────────────────────────────────

console.log()
console.log('═══════════════════════════════════════════════════════════════')
console.log()

// 模型汇总
const available = modelResults.filter(r => r.status === 200)
const rateLimited = modelResults.filter(r => r.status === 429)
const notFound = modelResults.filter(r => r.status === 404)

console.log('模型汇总:')
console.log(`  ✅ 可用 (${available.length}): ${available.map(m => m.id).join(', ')}`)
console.log(`  ⚡ 429限流 (${rateLimited.length}): ${rateLimited.map(m => m.id).join(', ')}`)
console.log(`  ❌ 不存在 (${notFound.length}): ${notFound.map(m => m.id).join(', ')}`)

console.log()
console.log('注意: 429 = 模型存在但被限速。Max 用户换个时间段应该都能用。')
console.log()
