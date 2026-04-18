#!/usr/bin/env bun
/**
 * 专项探测 claude-opus-4-7 的能力
 * - 基础可用性 / stop_reason
 * - 各 beta header 能否被该模型接受
 * - 1M context / output-128k / interleaved-thinking / skills / cached-mc 等
 * - 与 opus-4-6 / sonnet-4-6 对比新增能力
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

function getAuth() {
  const credPath = join(homedir(), '.claude', '.credentials.json')
  const raw = readFileSync(credPath, 'utf8')
  const token = JSON.parse(raw)?.claudeAiOauth?.accessToken
  if (!token) { console.error('no token'); process.exit(1) }
  return {
    Authorization: `Bearer ${token}`,
    'anthropic-beta': 'oauth-2025-04-20',
  }
}
const auth = getAuth()
const API_URL = 'https://api.anthropic.com/v1/messages'
const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

async function call(model: string, extraBetas: string[] = []) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'anthropic-version': '2023-06-01',
    ...auth,
  }
  if (extraBetas.length) {
    headers['anthropic-beta'] = [headers['anthropic-beta'], ...extraBetas].join(',')
  }
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
  }
}

const MODELS = ['claude-opus-4-7', 'claude-opus-4-6', 'claude-sonnet-4-6']

console.log('\n━━━ Part A: 基础可用性 ━━━\n')
for (const m of MODELS) {
  const r = await call(m)
  const icon = r.status === 200 ? '✅' : r.status === 429 ? '⚡' : '❌'
  console.log(`${icon} ${m.padEnd(22)} status=${r.status} stop=${r.body?.stop_reason ?? '-'} ${r.error ? '| ' + r.error.slice(0,150) : ''}`)
  await delay(1500)
}

// 短别名 & 日期后缀
console.log('\n━━━ Part B: Opus 4.7 别名/日期后缀 ━━━\n')
const aliases = [
  'claude-opus-4-7',
  'claude-opus-4-7-20260101',
  'claude-opus-4-7-20260201',
  'claude-opus-4-7-20260301',
  'claude-opus-4-7-20260401',
  'claude-opus-4-7-latest',
]
for (const m of aliases) {
  const r = await call(m)
  const icon = r.status === 200 ? '✅' : r.status === 429 ? '⚡' : r.status === 404 ? '❌' : '⚠️'
  console.log(`${icon} ${m.padEnd(32)} status=${r.status} ${r.error ? '| ' + r.error.slice(0,120) : ''}`)
  await delay(1500)
}

// Beta 矩阵：对 Opus 4.7 逐一试
console.log('\n━━━ Part C: Opus 4.7 beta 兼容矩阵 ━━━\n')
const betas = [
  'context-1m-2025-08-07',
  'output-128k-2025-02-19',
  'interleaved-thinking-2025-05-14',
  'interleaved-thinking-2025-01-24',
  'computer-use-2025-01-24',
  'computer-use-2024-10-22',
  'token-efficient-tools-2025-02-19',
  'fine-grained-tool-streaming-2025-05-14',
  'prompt-caching-2024-07-31',
  'skills-2025-10-02',
  'code-execution-2025-05-22',
  'files-api-2025-04-14',
  'mcp-client-2025-04-04',
  'extended-cache-ttl-2025-04-11',
  'task-budgets-2026-03-13',
  'microcompact-2026-01-01',
  'cached-mc-2026-01-01',
  'search-results-2025-06-09',
]
for (const b of betas) {
  const r = await call('claude-opus-4-7', [b])
  const isBetaReject = r.status === 400 && (r.error?.includes('anthropic-beta') ?? false)
  const accepted = !isBetaReject && (r.status === 200 || r.status === 429 || (r.status === 400 && !isBetaReject))
  const icon = r.status === 200 ? '✅' : r.status === 429 ? '⚡' : isBetaReject ? '❌' : '🎯'
  console.log(`${icon} ${b.padEnd(42)} status=${r.status} ${accepted ? '(accepted)' : '(rejected)'} ${r.error ? '| ' + r.error.slice(0,120) : ''}`)
  await delay(1200)
}

console.log('\n注: ⚡=429 限流(header 解析已通过,说明 beta 被接受),❌=beta 被 API 拒绝,🎯=语义错误(beta 接受但需要额外参数),✅=200 OK\n')
