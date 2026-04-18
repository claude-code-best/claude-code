#!/usr/bin/env bun
/**
 * Beta Header 真实 API 测试脚本 (OAuth 订阅用户版)
 *
 * 用法:
 *   bun run scripts/test-beta-headers.ts
 *
 * 自动从 ~/.claude/.credentials.json 读取 OAuth token,
 * 也支持 ANTHROPIC_API_KEY 环境变量作为 fallback。
 *
 * 测试内容:
 *   1. 正常 betas → 期望成功
 *   2. 包含空字符串的 betas → 期望 400
 *   3. filter(Boolean) 修复后 → 期望成功
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

// ── 认证 ──────────────────────────────────────────────────────────

type AuthInfo = {
  type: 'oauth' | 'apikey'
  headers: Record<string, string>
}

function getAuth(): AuthInfo {
  // 1. 尝试 OAuth token
  const credPath = join(homedir(), '.claude', '.credentials.json')
  try {
    const raw = readFileSync(credPath, 'utf8')
    const creds = JSON.parse(raw)
    const token = creds?.claudeAiOauth?.accessToken
    if (token) {
      return {
        type: 'oauth',
        headers: {
          Authorization: `Bearer ${token}`,
          'anthropic-beta': 'oauth-2025-04-20', // OAUTH_BETA_HEADER
        },
      }
    }
  } catch {
    // 文件不存在或解析失败，继续 fallback
  }

  // 2. Fallback 到 API key
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (apiKey) {
    return {
      type: 'apikey',
      headers: { 'x-api-key': apiKey },
    }
  }

  console.error('❌ 未找到认证信息')
  console.error('   需要 ~/.claude/.credentials.json (OAuth) 或 ANTHROPIC_API_KEY 环境变量')
  process.exit(1)
}

const auth = getAuth()

// ── 测试定义 ──────────────────────────────────────────────────────

const API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-haiku-4-5-20251001'

interface TestCase {
  name: string
  /** 额外的 beta 值，会与 auth header 中的合并。null = 不额外加 */
  extraBeta: string | null
  /** 是否直接覆盖整个 anthropic-beta header */
  overrideFullHeader?: string
  expectStatus: number
  description: string
}

const testCases: TestCase[] = [
  {
    name: '1. 基线: 仅 OAuth beta',
    extraBeta: null,
    expectStatus: 200,
    description: '只发送认证自带的 beta header，确认基线可用',
  },
  {
    name: '2. 正常: 追加 claude-code beta',
    extraBeta: 'claude-code-20250219',
    expectStatus: 200,
    description: '追加一个合法的 beta header',
  },
  {
    name: '3. 正常: 追加多个 betas',
    extraBeta: 'claude-code-20250219,interleaved-thinking-2025-05-14',
    expectStatus: 200,
    description: '追加多个合法的 beta headers',
  },
  {
    name: '4. 🐛 BUG重现: 空字符串 beta (覆盖整个 header)',
    overrideFullHeader: '',
    expectStatus: 401, // OAuth 用户: 丢失 oauth beta → 401 先于 400
    description: 'OAuth 用户: 覆盖为空字符串会丢失 oauth-2025-04-20，导致 401',
  },
  {
    name: '5. 🐛 BUG重现: 尾部逗号',
    overrideFullHeader: 'oauth-2025-04-20,claude-code-20250219,',
    expectStatus: 400,
    description: '尾部逗号模拟空字符串在数组末尾 (Array.toString() 行为)',
  },
  {
    name: '6. 🐛 BUG重现: 连续逗号',
    overrideFullHeader: 'oauth-2025-04-20,,claude-code-20250219',
    expectStatus: 400,
    description: '连续逗号模拟空字符串在数组中间',
  },
  {
    name: '7. 🐛 BUG重现: 纯逗号',
    overrideFullHeader: ',',
    expectStatus: 401, // OAuth 用户: 解析出的全是空值，没有 oauth beta → 401
    description: 'OAuth 用户: 纯逗号解析不出 oauth beta → 401',
  },
  {
    name: '8. ✅ 修复验证: filter(Boolean) 后',
    extraBeta: ['claude-code-20250219', '', 'interleaved-thinking-2025-05-14']
      .filter(Boolean)
      .join(','),
    expectStatus: 200,
    description: '空字符串被 filter(Boolean) 移除后，请求应该成功',
  },
  {
    name: '9. OAuth 边界: 不发 beta header',
    overrideFullHeader: undefined as any,
    expectStatus: 200, // auth.headers 自带 oauth beta，不覆盖就没问题
    description: 'OAuth 用户: 不覆盖 header，保持认证自带的 oauth beta',
  },
]

// ── 执行 ──────────────────────────────────────────────────────────

async function runTest(tc: TestCase): Promise<{
  name: string
  status: number
  pass: boolean
  detail?: string
}> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'anthropic-version': '2023-06-01',
    ...auth.headers,
  }

  // 处理 beta header
  if (tc.overrideFullHeader !== undefined) {
    if (tc.overrideFullHeader === '' || tc.overrideFullHeader === null) {
      // 空字符串：设为空
      headers['anthropic-beta'] = tc.overrideFullHeader ?? ''
    } else {
      headers['anthropic-beta'] = tc.overrideFullHeader
    }
  } else if (tc.extraBeta) {
    // 追加到 auth 自带的 beta header
    const existing = headers['anthropic-beta'] ?? ''
    headers['anthropic-beta'] = existing
      ? `${existing},${tc.extraBeta}`
      : tc.extraBeta
  }
  // null extraBeta + no override → 保持 auth 自带的 header

  const body = JSON.stringify({
    model: MODEL,
    max_tokens: 1,
    messages: [{ role: 'user', content: 'hi' }],
  })

  try {
    const resp = await fetch(API_URL, { method: 'POST', headers, body })
    const status = resp.status
    const pass = status === tc.expectStatus

    let detail: string | undefined
    if (!pass || status >= 400) {
      const respBody = await resp.text()
      try {
        const json = JSON.parse(respBody)
        detail = json?.error?.message?.slice(0, 200) ?? respBody.slice(0, 200)
      } catch {
        detail = respBody.slice(0, 200)
      }
    }

    return { name: tc.name, status, pass, detail }
  } catch (err) {
    return { name: tc.name, status: -1, pass: false, detail: String(err).slice(0, 200) }
  }
}

// ── 主程序 ────────────────────────────────────────────────────────

console.log()
console.log('╔══════════════════════════════════════════════════════════╗')
console.log('║     Beta Header API 兼容性测试                          ║')
console.log('╠══════════════════════════════════════════════════════════╣')
console.log(`║ 认证: ${auth.type.padEnd(50)}║`)
console.log(`║ 模型: ${MODEL.padEnd(50)}║`)
console.log('╚══════════════════════════════════════════════════════════╝')
console.log()

let passed = 0
let failed = 0
const results: Array<{ pass: boolean; name: string }> = []

for (const tc of testCases) {
  const result = await runTest(tc)

  const icon = result.pass ? '✅' : '❌'
  const statusStr = result.status === -1 ? 'ERR' : String(result.status)

  console.log(`${icon} ${result.name}`)
  console.log(`   ${tc.description}`)
  console.log(`   状态: ${statusStr} (期望 ${tc.expectStatus})`)
  if (result.detail) {
    console.log(`   响应: ${result.detail}`)
  }
  console.log()

  results.push({ pass: result.pass, name: tc.name })
  if (result.pass) passed++
  else failed++
}

// ── 汇总 ──────────────────────────────────────────────────────────

console.log('═══════════════════════════════════════════════════════════')
console.log(`结果: ${passed} pass / ${failed} fail / ${testCases.length} total`)
console.log()

if (failed > 0) {
  console.log('❌ 未通过的测试:')
  for (const r of results) {
    if (!r.pass) console.log(`   - ${r.name}`)
  }
  console.log()
}

console.log('── 分析 ──')
const bugCases = results.filter(r => r.name.includes('BUG重现'))
const fixCases = results.filter(r => r.name.includes('修复验证'))
const allBugsConfirmed = bugCases.every(r => r.pass)
const allFixesWork = fixCases.every(r => r.pass)

if (allBugsConfirmed) {
  console.log('✅ Bug 确认: 空字符串/逗号异常的 beta header 确实导致 API 400')
} else {
  console.log('⚠️  部分 bug case 未按预期返回 400 — API 行为可能已变化')
}

if (allFixesWork) {
  console.log('✅ 修复有效: filter(Boolean) 后请求正常通过')
} else {
  console.log('❌ 修复验证失败 — 需要进一步排查')
}

console.log()
process.exit(failed > 0 ? 1 : 0)
