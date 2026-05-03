/**
 * 技能搜索的意图归一化层
 *
 * 问题：当用户查询是中文而大多数技能描述是英文时，TF-IDF 的词袋模型会丢失语义。
 * CJK 二元组会得到 DF=1（语言不匹配，而非真正的罕见性），产生的 IDF 值会促进虚假匹配，
 * 例如 `帮我优化代码的性能` 匹配到 `prompt-optimizer`。
 *
 * 解决方案：在将查询传递给 `searchSkills()` 之前，要求 Haiku 将其归一化为 3-6 个英文任务/对象关键词。
 * 将归一化后的形式与原始查询拼接，这样 TF-IDF 就能同时看到两者 —— 英文关键词提供真正的匹配信号，
 * 原始文本则作为回退保留。
 *
 * 设计：
 * - 仅在第零轮（阻塞等待用户输入）：每个会话唯一的查询调用一次 Haiku。
 *   不会在轮次间的预取中调用（预取会在每个工具循环中重复执行）。
 * - 进程级缓存：会话内相同的查询复用结果。
 * - 优雅回退：Haiku 失败/超时/返回空 → 返回原始查询。
 * - ASCII 快速路径：不包含 CJK 字符的查询完全跳过 LLM。
 * - 功能门控：设置 `SKILL_SEARCH_INTENT_ENABLED=1` 来选择加入。
 */

import { queryHaiku } from '../api/claude.ts'
import { asSystemPrompt } from '../../utils/systemPromptType.js'
import { logForDebugging } from '../../utils/debug.js'

const INTENT_SYSTEM_PROMPT = `你是一个用于技能搜索索引的查询归一化器。

给定用户的自然语言请求（通常是中文，可能较长），提取 3-6 个英文关键词，涵盖：
1. 任务动词（optimize, review, debug, refactor, test, deploy, analyze, write, audit, design, research, cleanup, implement）
2. 对象（code, prompt, test, UI, API, database, documentation, performance, security, architecture）
3. 当明确时的上下文/领域（frontend, backend, mobile, python, go, rust, typescript）

仅输出空格分隔的小写英文关键词。不要输出说明文字、JSON、标点符号、代码块标记。

示例：
- "帮我优化代码的性能" -> optimize code performance refactor
- "研究当前代码的实现然后分析优化思路" -> analyze code research refactor architecture
- "优化 prompt 的表达" -> optimize prompt refine writing
- "帮我做 code review" -> code review audit
- "清理代码里的 TODO" -> cleanup refactor dead-code
- "重构这个模块的代码" -> refactor code modularize
- "帮我写个 Go 单元测试" -> write test golang unit

只输出关键词，不输出其他内容。`

const DEFAULT_TIMEOUT_MS = 6_000
const MAX_QUERY_CHARS = 500
const MAX_KEYWORDS_CHARS = 120

/** Process-level cache. Keyed by the original (trimmed) query. */
const cache = new Map<string, string>()

export function isIntentNormalizeEnabled(): boolean {
  return process.env.SKILL_SEARCH_INTENT_ENABLED === '1'
}

/** Only reset between tests. */
export function clearIntentNormalizeCache(): void {
  cache.clear()
}

/**
 * 归一化用户查询，使 TF-IDF 能够识别英文任务关键词。
 * 成功时返回 `<原始查询> <关键词>`，任何失败路径下返回原始字符串。
 * 绝不抛出异常。
 */
export async function normalizeQueryIntent(query: string): Promise<string> {
  const trimmed = query.trim()
  if (!trimmed) return trimmed
  if (!isIntentNormalizeEnabled()) return trimmed

  // ASCII-only queries are already in the right shape for the index.
  if (!/[\u4e00-\u9fff]/.test(trimmed)) return trimmed

  const cached = cache.get(trimmed)
  if (cached !== undefined) return cached

  const capped = trimmed.slice(0, MAX_QUERY_CHARS)
  //调用大模型进行词语拆分，并返回3-6个英文关键词。
  const keywords = await callHaiku(capped)
  const result = keywords ? `${trimmed} ${keywords}` : trimmed
  cache.set(trimmed, result)
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
