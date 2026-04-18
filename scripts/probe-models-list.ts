#!/usr/bin/env bun
/**
 * 测试 anthropic.models.list() API 是否对 OAuth 用户开放
 * 如果开放，就能动态获取模型的 max_input_tokens 和 max_tokens
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
  return token
}

const token = getAuth()
const API_BASE = 'https://api.anthropic.com/v1'

console.log()
console.log('━━━ 测试 /v1/models API ━━━')
console.log()

// Test 1: List models
console.log('── Test 1: GET /v1/models (列出所有模型) ──')
try {
  const resp = await fetch(`${API_BASE}/models`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'oauth-2025-04-20',
    },
  })
  console.log(`   状态: ${resp.status}`)

  if (resp.status === 200) {
    const data = await resp.json() as any
    const models = data.data ?? data
    if (Array.isArray(models)) {
      console.log(`   ✅ 返回 ${models.length} 个模型`)
      console.log()
      console.log('   模型列表:')
      for (const m of models) {
        const id = m.id ?? m
        const maxInput = m.max_input_tokens ?? '?'
        const maxOutput = m.max_tokens ?? '?'
        const created = m.created_at ? (typeof m.created_at === 'string' ? m.created_at.split('T')[0] : new Date(m.created_at * 1000).toISOString().split('T')[0]) : '?'
        console.log(`   ${String(id).padEnd(45)} input=${String(maxInput).padEnd(10)} output=${String(maxOutput).padEnd(10)} created=${created}`)
      }
    } else {
      console.log(`   响应结构: ${JSON.stringify(data).slice(0, 500)}`)
    }
  } else {
    const text = await resp.text()
    console.log(`   ❌ ${text.slice(0, 300)}`)
  }
} catch (err) {
  console.log(`   ❌ Error: ${String(err).slice(0, 200)}`)
}

// Test 2: Get specific model
console.log()
console.log('── Test 2: GET /v1/models/claude-opus-4-6 (获取单个模型信息) ──')
try {
  const resp = await fetch(`${API_BASE}/models/claude-opus-4-6`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'oauth-2025-04-20',
    },
  })
  console.log(`   状态: ${resp.status}`)
  const data = await resp.json() as any

  if (resp.status === 200) {
    console.log(`   ✅ 模型信息:`)
    console.log(`   ${JSON.stringify(data, null, 2).split('\n').join('\n   ')}`)
  } else {
    console.log(`   ❌ ${data?.error?.message ?? JSON.stringify(data).slice(0, 300)}`)
  }
} catch (err) {
  console.log(`   ❌ Error: ${String(err).slice(0, 200)}`)
}

console.log()
console.log('── 结论 ──')
console.log('如果 /v1/models 返回 200 且包含 max_input_tokens/max_tokens，')
console.log('我们就可以去掉 isModelCapabilitiesEligible 中的 ant-only 限制，')
console.log('让所有用户都能动态获取模型能力，不再依赖硬编码。')
console.log()
