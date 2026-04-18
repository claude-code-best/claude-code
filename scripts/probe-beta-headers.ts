#!/usr/bin/env bun
/**
 * Beta Header 探测脚本
 *
 * 用法:
 *   bun run scripts/probe-beta-headers.ts
 *
 * 逐个测试所有已知的 beta header，看 API 接受哪些、拒绝哪些。
 * 同时尝试猜测 CACHE_EDITING_BETA_HEADER 的真实值。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

// ── 认证 ──────────────────────────────────────────────────────────

function getOAuthToken(): string {
  const credPath = join(homedir(), '.claude', '.credentials.json')
  try {
    const raw = readFileSync(credPath, 'utf8')
    const creds = JSON.parse(raw)
    const token = creds?.claudeAiOauth?.accessToken
    if (token) return token
  } catch {}

  if (process.env.ANTHROPIC_API_KEY) {
    return '' // 用 API key 模式
  }

  console.error('❌ 未找到认证信息')
  process.exit(1)
}

const oauthToken = getOAuthToken()
const useOAuth = !!oauthToken
const OAUTH_BETA = 'oauth-2025-04-20'

// ── 要测试的 beta headers ─────────────────────────────────────────

// 1. 代码中已知的所有 beta header 常量
const KNOWN_HEADERS = [
  { name: 'CLAUDE_CODE_20250219', value: 'claude-code-20250219' },
  { name: 'INTERLEAVED_THINKING', value: 'interleaved-thinking-2025-05-14' },
  { name: 'CONTEXT_1M', value: 'context-1m-2025-08-07' },
  { name: 'CONTEXT_MANAGEMENT', value: 'context-management-2025-06-27' },
  { name: 'STRUCTURED_OUTPUTS', value: 'structured-outputs-2025-12-15' },
  { name: 'WEB_SEARCH', value: 'web-search-2025-03-05' },
  { name: 'TOOL_SEARCH_1P', value: 'advanced-tool-use-2025-11-20' },
  { name: 'TOOL_SEARCH_3P', value: 'tool-search-tool-2025-10-19' },
  { name: 'EFFORT', value: 'effort-2025-11-24' },
  { name: 'TASK_BUDGETS', value: 'task-budgets-2026-03-13' },
  { name: 'PROMPT_CACHING_SCOPE', value: 'prompt-caching-scope-2026-01-05' },
  { name: 'FAST_MODE', value: 'fast-mode-2026-02-01' },
  { name: 'REDACT_THINKING', value: 'redact-thinking-2026-02-12' },
  { name: 'TOKEN_EFFICIENT_TOOLS', value: 'token-efficient-tools-2026-03-28' },
  { name: 'AFK_MODE', value: 'afk-mode-2026-01-31' },
  { name: 'CLI_INTERNAL', value: 'cli-internal-2026-02-09' },
  { name: 'ADVISOR_TOOL', value: 'advisor-tool-2026-03-01' },
  { name: 'OAUTH', value: 'oauth-2025-04-20' },
]

// 2. 猜测 CACHE_EDITING 的可能真实值
const CACHE_EDITING_GUESSES = [
  'cache-editing-2025-01-01',
  'cache-editing-2025-06-01',
  'cache-editing-2025-12-01',
  'cache-editing-2026-01-01',
  'cache-editing-2026-02-01',
  'cache-editing-2026-03-01',
  'cache-editing-2026-04-01',
  'cached-microcompact-2025-01-01',
  'cached-microcompact-2026-01-01',
  'kv-cache-deletion-2025-01-01',
  'kv-cache-deletion-2026-01-01',
  'cache-edits-2025-01-01',
  'cache-edits-2026-01-01',
  'cache-edits-2026-02-01',
  'cache-edits-2026-03-01',
]

// ── API 调用 ──────────────────────────────────────────────────────

const API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-haiku-4-5-20251001'

async function testBeta(betaValue: string): Promise<{
  status: number
  accepted: boolean
  error?: string
}> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'anthropic-version': '2023-06-01',
  }

  if (useOAuth) {
    headers['Authorization'] = `Bearer ${oauthToken}`
    // OAuth 需要 oauth beta，加上被测试的 beta
    headers['anthropic-beta'] = `${OAUTH_BETA},${betaValue}`
  } else {
    headers['x-api-key'] = process.env.ANTHROPIC_API_KEY!
    headers['anthropic-beta'] = betaValue
  }

  const body = JSON.stringify({
    model: MODEL,
    max_tokens: 1,
    messages: [{ role: 'user', content: 'hi' }],
  })

  try {
    const resp = await fetch(API_URL, { method: 'POST', headers, body })
    const status = resp.status

    if (status === 200) {
      // 消费响应体
      await resp.text()
      return { status, accepted: true }
    }

    const respBody = await resp.text()
    let error: string
    try {
      const json = JSON.parse(respBody)
      error = json?.error?.message?.slice(0, 200) ?? respBody.slice(0, 200)
    } catch {
      error = respBody.slice(0, 200)
    }

    // 400 + "Unexpected value" = beta 被拒绝
    // 200 = beta 被接受（可能被忽略）
    // 其他状态码 = 其他问题
    const isBetaRejection =
      status === 400 && error.includes('anthropic-beta')

    return {
      status,
      accepted: !isBetaRejection,
      error,
    }
  } catch (err) {
    return { status: -1, accepted: false, error: String(err).slice(0, 200) }
  }
}

// ── 主程序 ────────────────────────────────────────────────────────

console.log()
console.log('╔═══════════════════════════════════════════════════════════╗')
console.log('║     Beta Header 探测 — 哪些 header API 接受？            ║')
console.log('╠═══════════════════════════════════════════════════════════╣')
console.log(`║ 认证: ${(useOAuth ? 'OAuth' : 'API Key').padEnd(51)}║`)
console.log(`║ 模型: ${MODEL.padEnd(51)}║`)
console.log('╚═══════════════════════════════════════════════════════════╝')

// Part 1: 已知 headers
console.log()
console.log('━━━ 第一部分：代码中已知的 beta headers ━━━')
console.log()

const accepted: string[] = []
const rejected: string[] = []
const unknown: string[] = []

for (const h of KNOWN_HEADERS) {
  // 跳过 oauth 自身（已经在基线中）
  if (h.value === OAUTH_BETA && useOAuth) {
    console.log(`⏭️  ${h.name.padEnd(30)} ${h.value}  (OAuth 基线，跳过)`)
    accepted.push(h.value)
    continue
  }

  const result = await testBeta(h.value)

  if (result.accepted) {
    console.log(`✅ ${h.name.padEnd(30)} ${h.value}`)
    accepted.push(h.value)
  } else if (result.status === 400) {
    console.log(`❌ ${h.name.padEnd(30)} ${h.value}`)
    console.log(`   └─ ${result.error}`)
    rejected.push(h.value)
  } else {
    console.log(`⚠️  ${h.name.padEnd(30)} ${h.value}  (status=${result.status})`)
    if (result.error) console.log(`   └─ ${result.error}`)
    unknown.push(h.value)
  }
}

// Part 2: 猜测 cache editing header
console.log()
console.log('━━━ 第二部分：猜测 CACHE_EDITING_BETA_HEADER ━━━')
console.log()

const cacheEditingCandidates: string[] = []

for (const guess of CACHE_EDITING_GUESSES) {
  const result = await testBeta(guess)

  if (result.accepted) {
    console.log(`🎯 ${guess}  ← API 接受了！`)
    cacheEditingCandidates.push(guess)
  } else if (result.status === 400 && result.error?.includes('anthropic-beta')) {
    console.log(`❌ ${guess}`)
  } else {
    console.log(`⚠️  ${guess}  (status=${result.status})`)
    if (result.error) console.log(`   └─ ${result.error}`)
  }
}

// ── 汇总 ──────────────────────────────────────────────────────────

console.log()
console.log('═══════════════════════════════════════════════════════════')
console.log()
console.log(`已知 headers 结果:`)
console.log(`  ✅ 接受: ${accepted.length}`)
console.log(`  ❌ 拒绝: ${rejected.length}`)
if (rejected.length > 0) {
  for (const r of rejected) console.log(`     - ${r}`)
}
if (unknown.length > 0) {
  console.log(`  ⚠️  未知: ${unknown.length}`)
  for (const u of unknown) console.log(`     - ${u}`)
}

console.log()
if (cacheEditingCandidates.length > 0) {
  console.log(`🎯 可能的 CACHE_EDITING_BETA_HEADER:`)
  for (const c of cacheEditingCandidates) {
    console.log(`   - ${c}`)
  }
  console.log()
  console.log('注意: API "接受"不代表功能启用。API 对未知 beta 可能选择:')
  console.log('  1. 静默忽略（返回 200 但功能不生效）')
  console.log('  2. 拒绝（返回 400）')
  console.log('需要进一步测试 cache_reference 字段是否被实际接受。')
} else {
  console.log('❌ 未猜中 CACHE_EDITING_BETA_HEADER 的真实值')
  console.log('   API 可能对未知 beta 直接拒绝，或需要更多猜测')
}

console.log()
