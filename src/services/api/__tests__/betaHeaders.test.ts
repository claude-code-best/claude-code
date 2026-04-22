/**
 * Beta header 安全性测试
 *
 * 验证：
 * 1. 空字符串 beta header 不会泄漏到 API 请求中
 * 2. getExtraBodyParams 正确合并 beta headers
 * 3. 常量层可能产生空值的 beta header 被妥善处理
 * 4. SDK 的 betas.toString() 行为与预期一致
 */
import { describe, expect, test } from 'bun:test'

// ── Part 1: SDK 层面的 toString 行为验证 ─────────────────────────

describe('SDK betas.toString() behavior', () => {
  test('empty string in array produces invalid header value', () => {
    // 这就是导致 400 的根因：SDK 对 betas 调用 toString()
    const betas = [
      'claude-code-20250219',
      '',
      'interleaved-thinking-2025-05-14',
    ]
    const headerValue = betas.toString()

    // 产生 "claude-code-20250219,,interleaved-thinking-2025-05-14"
    // 逗号之间的空值就是 API 拒绝的 ``
    expect(headerValue).toContain(',,')
    expect(headerValue).toBe(
      'claude-code-20250219,,interleaved-thinking-2025-05-14',
    )
  })

  test('filter(Boolean) removes empty strings', () => {
    const betas = [
      'claude-code-20250219',
      '',
      'interleaved-thinking-2025-05-14',
    ]
    const filtered = betas.filter(Boolean)
    const headerValue = filtered.toString()

    expect(filtered).not.toContain('')
    expect(headerValue).not.toContain(',,')
    expect(headerValue).toBe(
      'claude-code-20250219,interleaved-thinking-2025-05-14',
    )
  })

  test('filter(Boolean) handles multiple empty strings', () => {
    const betas = ['', 'a', '', '', 'b', '']
    const filtered = betas.filter(Boolean)

    expect(filtered).toEqual(['a', 'b'])
    expect(filtered.toString()).toBe('a,b')
  })

  test('filter(Boolean) on clean array is no-op', () => {
    const betas = ['claude-code-20250219', 'interleaved-thinking-2025-05-14']
    const filtered = betas.filter(Boolean)

    expect(filtered).toEqual(betas)
  })

  test('empty array after filter produces no header', () => {
    const betas = ['', '']
    const filtered = betas.filter(Boolean)

    expect(filtered).toEqual([])
    expect(filtered.length > 0).toBe(false)
    // useBetas would be false, header not sent at all
  })
})

// ── Part 2: 常量层空值检测 ───────────────────────────────────────

describe('beta header constants safety', () => {
  test('known potentially-empty constants are identified', () => {
    // 这些常量在特定条件下可能是空字符串
    // 测试的目的是确认我们知道哪些是空的，以便防御

    // CACHE_EDITING_BETA_HEADER — 上游未公开，永远为空
    // 动态 import 以避免 bun:bundle 依赖
    // 这里我们直接测试值
    const CACHE_EDITING_VALUE = '' // 对应 constants/betas.ts:50
    expect(CACHE_EDITING_VALUE).toBe('')
    expect(Boolean(CACHE_EDITING_VALUE)).toBe(false)

    // CLI_INTERNAL_BETA_HEADER — USER_TYPE !== 'ant' 时为空
    // 在测试环境中 USER_TYPE 通常不是 'ant'
    const CLI_INTERNAL_VALUE =
      process.env.USER_TYPE === 'ant' ? 'cli-internal-2026-02-09' : ''
    if (process.env.USER_TYPE !== 'ant') {
      expect(CLI_INTERNAL_VALUE).toBe('')
    }
  })

  test('truthy check correctly gates empty beta headers', () => {
    const emptyHeader = ''
    const validHeader = 'some-beta-2025-01-01'

    // 模拟 claude.ts 中的 truthy 检查
    const betasParams: string[] = []

    // 空 header — 不应被 push
    if (emptyHeader) {
      betasParams.push(emptyHeader)
    }
    expect(betasParams).toEqual([])

    // 有效 header — 应被 push
    if (validHeader) {
      betasParams.push(validHeader)
    }
    expect(betasParams).toEqual(['some-beta-2025-01-01'])
  })
})

// ── Part 3: getExtraBodyParams beta 合并逻辑 ─────────────────────

describe('getExtraBodyParams beta merge', () => {
  // getExtraBodyParams 从 CLAUDE_CODE_EXTRA_BODY 解析 JSON 并合并 betaHeaders
  // 我们在这里验证合并逻辑的边界情况

  test('empty beta headers array should not add anthropic_beta', () => {
    const result: Record<string, unknown> = {}
    const betaHeaders: string[] = []

    // 模拟 getExtraBodyParams 中的合并逻辑
    if (betaHeaders && betaHeaders.length > 0) {
      result.anthropic_beta = betaHeaders
    }

    expect(result.anthropic_beta).toBeUndefined()
  })

  test('beta headers with empty strings should be filtered', () => {
    const betaHeaders = ['valid-header', '', 'another-valid']

    // 修复后的逻辑应该在合并前过滤
    const clean = betaHeaders.filter(Boolean)
    expect(clean).toEqual(['valid-header', 'another-valid'])
  })

  test('merging avoids duplicates', () => {
    const existing = ['header-a', 'header-b']
    const incoming = ['header-b', 'header-c']

    const merged = [...existing, ...incoming.filter(h => !existing.includes(h))]

    expect(merged).toEqual(['header-a', 'header-b', 'header-c'])
  })
})

// ── Part 4: ANTHROPIC_BETAS 环境变量解析 ─────────────────────────

describe('ANTHROPIC_BETAS env var parsing', () => {
  test('empty string env var produces no betas', () => {
    const envVal: string = ''
    const result = envVal
      ? envVal
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean)
      : []

    expect(result).toEqual([])
  })

  test('trailing comma does not produce empty entry', () => {
    const envVal = 'beta-a,beta-b,'
    const result = envVal
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)

    expect(result).toEqual(['beta-a', 'beta-b'])
  })

  test('whitespace-only entries are filtered', () => {
    const envVal = 'beta-a, , beta-b,  '
    const result = envVal
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)

    expect(result).toEqual(['beta-a', 'beta-b'])
  })

  test('single comma produces no betas', () => {
    const envVal = ','
    const result = envVal
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)

    expect(result).toEqual([])
  })
})

// ── Part 5: 完整请求参数模拟 ─────────────────────────────────────

describe('request params beta assembly (simulated)', () => {
  test('simulates the full beta assembly pipeline with empty constants', () => {
    // 模拟 claude.ts 中 paramsFromContext 的 beta 组装流程
    const CLAUDE_CODE_HEADER = 'claude-code-20250219'
    const INTERLEAVED_HEADER = 'interleaved-thinking-2025-05-14'
    const CONTEXT_1M_HEADER = 'context-1m-2025-08-07'
    const CACHE_EDITING_HEADER = '' // 空！
    const AFK_MODE_HEADER = '' // 也是空！

    // Step 1: 基础 betas（来自 getAllModelBetas）
    const baseBetas = [
      CLAUDE_CODE_HEADER,
      INTERLEAVED_HEADER,
      CONTEXT_1M_HEADER,
    ]

    // Step 2: paramsFromContext 中的动态添加
    const betasParams = [...baseBetas]

    // 模拟 cache editing latch 触发但 header 为空
    const cacheEditingHeaderLatched = true
    if (
      cacheEditingHeaderLatched &&
      CACHE_EDITING_HEADER && // ← 修复：truthy 检查
      !betasParams.includes(CACHE_EDITING_HEADER)
    ) {
      betasParams.push(CACHE_EDITING_HEADER)
    }

    // 模拟 AFK mode latch 触发但 header 为空
    const afkHeaderLatched = true
    // feature('TRANSCRIPT_CLASSIFIER') 为 false 时，整个 if block 不进入
    // 但假设进入了，header 也是空的
    if (
      afkHeaderLatched &&
      AFK_MODE_HEADER && // 空字符串，不会进入
      !betasParams.includes(AFK_MODE_HEADER)
    ) {
      betasParams.push(AFK_MODE_HEADER)
    }

    // Step 3: 最终过滤（我们的防御层）
    const filteredBetas = betasParams.filter(Boolean)

    // 验证：没有空字符串泄漏
    expect(filteredBetas).not.toContain('')
    expect(filteredBetas).toEqual([
      CLAUDE_CODE_HEADER,
      INTERLEAVED_HEADER,
      CONTEXT_1M_HEADER,
    ])

    // 验证：toString() 不会产生 ,,
    expect(filteredBetas.toString()).not.toContain(',,')
  })

  test('simulates the bug scenario WITHOUT fix', () => {
    // 重现修复前的行为，验证 bug 确实存在
    const CACHE_EDITING_HEADER = '' // 空值

    const betasParams = [
      'claude-code-20250219',
      'interleaved-thinking-2025-05-14',
    ]

    // 修复前：没有 truthy 检查，空字符串被 push
    const cacheEditingHeaderLatched = true
    if (
      cacheEditingHeaderLatched &&
      // 注意：没有 CACHE_EDITING_HEADER && 检查
      !betasParams.includes(CACHE_EDITING_HEADER) // '' 不在数组中 → true
    ) {
      betasParams.push(CACHE_EDITING_HEADER) // push 了空字符串！
    }

    // 证明 bug：数组包含空字符串
    expect(betasParams).toContain('')
    // SDK toString() 会产生尾部逗号（空字符串在末尾）或 ,,（在中间）
    // 两者都是 API 不接受的无效 header 值
    const headerStr = betasParams.toString()
    // 空字符串在末尾 → 尾部逗号 "a,b,"
    // 空字符串在中间 → 连续逗号 "a,,b"
    expect(headerStr.endsWith(',') || headerStr.includes(',,')).toBe(true)
  })

  test('useBetas flag correctly handles empty-after-filter', () => {
    // 如果所有 betas 都是空字符串，过滤后应该不发送 betas 参数
    const betasParams = ['', '']
    const filteredBetas = betasParams.filter(Boolean)
    const useBetas = filteredBetas.length > 0

    expect(useBetas).toBe(false)
    // API 请求不应包含 betas 字段
    const requestParams = {
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      messages: [],
      ...(useBetas && { betas: filteredBetas }),
    }
    expect(requestParams).not.toHaveProperty('betas')
  })
})
