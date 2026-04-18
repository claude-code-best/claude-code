#!/usr/bin/env bun
/**
 * output-128k beta 探测（v2 — 抗 429 版）
 *
 * 策略：
 * - 只测 3 个关键 case，最小化请求数
 * - 429 自动重试，指数退避最多 5 次
 * - 请求间隔 5 秒
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

function getAuth() {
  const credPath = join(homedir(), '.claude', '.credentials.json')
  const raw = readFileSync(credPath, 'utf8')
  const creds = JSON.parse(raw)
  const token = creds?.claudeAiOauth?.accessToken
  if (!token) { console.error('❌ 无 OAuth token'); process.exit(1) }
  return {
    Authorization: `Bearer ${token}`,
    'anthropic-beta': 'oauth-2025-04-20',
  }
}

const authHeaders = getAuth()
const API_URL = 'https://api.anthropic.com/v1/messages'

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function apiCallWithRetry(opts: {
  model: string
  maxTokens: number
  extraBetas: string[]
  label: string
  maxRetries?: number
}): Promise<void> {
  const maxRetries = opts.maxRetries ?? 5

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      ...authHeaders,
    }
    if (opts.extraBetas.length > 0) {
      headers['anthropic-beta'] = [headers['anthropic-beta'], ...opts.extraBetas].join(',')
    }

    const body = JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens,
      messages: [{ role: 'user', content: 'Say "ok" and nothing else.' }],
    })

    try {
      const resp = await fetch(API_URL, { method: 'POST', headers, body })
      const status = resp.status

      if (status === 429) {
        // 读取 retry-after header
        const retryAfter = resp.headers.get('retry-after')
        const waitSec = retryAfter ? parseInt(retryAfter, 10) : (5 * attempt)
        const waitMs = Math.min(waitSec * 1000, 60000)
        console.log(`   ⏳ 429 限流, 等待 ${waitSec}s 后重试 (${attempt}/${maxRetries})...`)
        await resp.text() // 消费 body
        await delay(waitMs)
        continue
      }

      const data = await resp.json() as any

      if (status === 200) {
        const outputTokens = data.usage?.output_tokens ?? '?'
        const inputTokens = data.usage?.input_tokens ?? '?'
        const stopReason = data.stop_reason ?? '?'
        console.log(`   ✅ 成功 (attempt ${attempt})`)
        console.log(`   stop_reason: ${stopReason}`)
        console.log(`   usage: input=${inputTokens}, output=${outputTokens}`)
        console.log(`   model: ${data.model ?? opts.model}`)
      } else {
        const error = data?.error?.message ?? JSON.stringify(data).slice(0, 300)
        console.log(`   ❌ ${status}: ${error}`)
      }
      return
    } catch (err) {
      console.log(`   ❌ 网络错误: ${String(err).slice(0, 150)}`)
      if (attempt < maxRetries) {
        console.log(`   ⏳ 等待 ${5 * attempt}s 后重试...`)
        await delay(5000 * attempt)
      }
    }
  }
  console.log(`   ❌ ${maxRetries} 次重试后仍然失败`)
}

// ── 主程序 ────────────────────────────────────────────────────────

console.log()
console.log('╔═══════════════════════════════════════════════════════════╗')
console.log('║     output-128k beta 探测 (v2 抗 429)                    ║')
console.log('╠═══════════════════════════════════════════════════════════╣')
console.log('║ 策略: 3 个关键测试 + 429 自动重试 + 指数退避              ║')
console.log('╚═══════════════════════════════════════════════════════════╝')

// ── Test 1: Opus 4.6, 128K, 无 beta ─────────────────────────────

console.log('\n── Test 1: Opus 4.6, max_tokens=128000, 无 output-128k beta ──')
console.log('   (如果 400 → 128K 需要 beta; 如果 200 → 128K 已默认开放)')
await apiCallWithRetry({
  model: 'claude-opus-4-6',
  maxTokens: 128000,
  extraBetas: [],
  label: 'opus-128k-no-beta',
})

await delay(5000)

// ── Test 2: Opus 4.6, 128K, 有 beta ─────────────────────────────

console.log('\n── Test 2: Opus 4.6, max_tokens=128000, 有 output-128k beta ──')
console.log('   (如果 Test1=400 而 Test2=200 → beta 是必要条件)')
await apiCallWithRetry({
  model: 'claude-opus-4-6',
  maxTokens: 128000,
  extraBetas: ['output-128k-2025-02-19'],
  label: 'opus-128k-with-beta',
})

await delay(5000)

// ── Test 3: Sonnet 4.6, 128K, 对比 ──────────────────────────────

console.log('\n── Test 3: Sonnet 4.6, max_tokens=128000, 无 beta ──')
await apiCallWithRetry({
  model: 'claude-sonnet-4-6',
  maxTokens: 128000,
  extraBetas: [],
  label: 'sonnet-128k-no-beta',
})

await delay(5000)

console.log('\n── Test 4: Sonnet 4.6, max_tokens=128000, 有 beta ──')
await apiCallWithRetry({
  model: 'claude-sonnet-4-6',
  maxTokens: 128000,
  extraBetas: ['output-128k-2025-02-19'],
  label: 'sonnet-128k-with-beta',
})

// ── 汇总 ──────────────────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════════')
console.log('判断标准:')
console.log('  Test1=400, Test2=200 → output-128k beta 是 128K 输出的必要条件，必须加')
console.log('  Test1=200, Test2=200 → 128K 已默认开放，beta 可选')
console.log('  Test1=400, Test2=400 → 128K 对该模型/订阅不可用')
console.log()
