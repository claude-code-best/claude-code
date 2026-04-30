/**
 * Intent Normalization Layer for Skill Search
 *
 * Problem: TF-IDF bag-of-words loses meaning when the user query is in Chinese
 * and most skill descriptions are English. CJK bi-grams get DF=1 (language
 * mismatch, not true rarity), producing IDF values that promote spurious
 * matches like `prompt-optimizer` for `帮我优化代码的性能`.
 *
 * Fix: Before handing the query to `searchSkills()`, ask Haiku to normalize it
 * into 3-6 English task/object keywords. Concatenate the normalized form with
 * the original so TF-IDF sees both — English keywords carry real matching
 * signal, the original text stays as a fallback.
 *
 * Design:
 * - Turn-zero only (blocking on user input): one Haiku call per session-unique
 *   query. Not called in inter-turn prefetch (which repeats per tool loop).
 * - Process-level cache: identical queries within a session reuse the result.
 * - Graceful fallback: Haiku failure / timeout / empty → return original query.
 * - ASCII-only fast path: queries without CJK characters skip the LLM entirely.
 * - Feature-flagged: `SKILL_SEARCH_INTENT_ENABLED=1` to opt in.
 */

import { queryHaiku } from '../api/claude.js'
import { asSystemPrompt } from '../../utils/systemPromptType.js'
import { logForDebugging } from '../../utils/debug.js'

const INTENT_SYSTEM_PROMPT = `You are a query normalizer for a skill-search index.

Given a user's natural-language request (often Chinese, possibly long), extract 3-6 English keywords that capture:
1. TASK VERB (optimize, review, debug, refactor, test, deploy, analyze, write, audit, design, research, cleanup, implement)
2. OBJECT (code, prompt, test, UI, API, database, documentation, performance, security, architecture)
3. CONTEXT/DOMAIN when clear (frontend, backend, mobile, python, go, rust, typescript)

Output ONLY space-separated lowercase English keywords. No prose, no JSON, no punctuation, no code fences.

Examples:
- "帮我优化代码的性能" -> optimize code performance refactor
- "研究当前代码的实现然后分析优化思路" -> analyze code research refactor architecture
- "优化 prompt 的表达" -> optimize prompt refine writing
- "帮我做 code review" -> code review audit
- "清理代码里的 TODO" -> cleanup refactor dead-code
- "重构这个模块的代码" -> refactor code modularize
- "帮我写个 Go 单元测试" -> write test golang unit

Output ONLY keywords. Nothing else.`

const DEFAULT_TIMEOUT_MS = 6_000
const MAX_QUERY_CHARS = 500
const MAX_KEYWORDS_CHARS = 120
/**
 * Bound on the process-level query→keywords cache. Insertion-order LRU —
 * Map iteration order is insertion order, so we evict from the front when
 * size exceeds the cap. ~200 entries × ~600 bytes (query + keywords) ≈
 * 120 KB worst case. Without this cap the cache grew monotonically with
 * the diversity of Chinese queries in a long session.
 */
const CACHE_MAX_ENTRIES = 200
const CACHE_TRIM_TO = 150

/** Process-level cache. Keyed by the original (trimmed) query. */
const cache = new Map<string, string>()

function setCachedQueryIntent(key: string, value: string): void {
  // Refresh insertion order on hit-then-write so frequently-used keys
  // stay alive (delete + set is the canonical Map-LRU idiom).
  if (cache.has(key)) cache.delete(key)
  cache.set(key, value)
  if (cache.size > CACHE_MAX_ENTRIES) {
    const toDrop = cache.size - CACHE_TRIM_TO
    const iter = cache.keys()
    for (let i = 0; i < toDrop; i++) {
      const next = iter.next()
      if (next.done) break
      cache.delete(next.value)
    }
  }
}

export function isIntentNormalizeEnabled(): boolean {
  return process.env.SKILL_SEARCH_INTENT_ENABLED === '1'
}

/** Only reset between tests. */
export function clearIntentNormalizeCache(): void {
  cache.clear()
}

/**
 * Normalize a user query so TF-IDF sees English task keywords.
 * Returns `<original> <keywords>` on success, or the original string on any
 * failure path. Never throws.
 */
export async function normalizeQueryIntent(query: string): Promise<string> {
  const trimmed = query.trim()
  if (!trimmed) return trimmed
  if (!isIntentNormalizeEnabled()) return trimmed

  // ASCII-only queries are already in the right shape for the index.
  if (!/[\u4e00-\u9fff]/.test(trimmed)) return trimmed

  const cached = cache.get(trimmed)
  if (cached !== undefined) {
    // Refresh LRU position so frequently-queried strings survive eviction.
    cache.delete(trimmed)
    cache.set(trimmed, cached)
    return cached
  }

  const capped = trimmed.slice(0, MAX_QUERY_CHARS)
  const keywords = await callHaiku(capped)
  const result = keywords ? `${trimmed} ${keywords}` : trimmed
  setCachedQueryIntent(trimmed, result)
  logForDebugging(
    `[skill-search] intent normalized: "${trimmed.slice(0, 40)}" -> "${keywords}"`,
  )
  return result
}

async function callHaiku(query: string): Promise<string> {
  const timeoutMs = getTimeoutMs()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await queryHaiku({
      systemPrompt: asSystemPrompt([INTENT_SYSTEM_PROMPT]),
      userPrompt: query,
      signal: controller.signal,
      options: {
        querySource: 'skill_search_intent',
        enablePromptCaching: true,
        agents: [],
        isNonInteractiveSession: true,
        hasAppendSystemPrompt: false,
        mcpTools: [],
      },
    })
    const text = extractResponseText(response?.message?.content)
    return sanitizeKeywords(text)
  } catch (error) {
    logForDebugging(`[skill-search] intent normalize failed: ${error}`)
    return ''
  } finally {
    clearTimeout(timer)
  }
}

function getTimeoutMs(): number {
  const raw = process.env.SKILL_SEARCH_INTENT_TIMEOUT_MS
  if (!raw) return DEFAULT_TIMEOUT_MS
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS
  return parsed
}

function extractResponseText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    const record = block as Record<string, unknown>
    if (record.type !== 'text') continue
    if (typeof record.text === 'string') parts.push(record.text)
  }
  return parts.join('').trim()
}

function sanitizeKeywords(raw: string): string {
  if (!raw) return ''
  // Strip anything that's not a keyword character. Keep ascii letters, digits,
  // hyphens, and spaces. Collapse whitespace.
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9\- ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return ''
  return cleaned.slice(0, MAX_KEYWORDS_CHARS)
}
