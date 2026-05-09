import type { Tools } from '../../Tool.js'
import { logForDebugging } from '../../utils/debug.js'
import {
  tokenizeAndStem,
  computeWeightedTf,
  computeIdf,
  cosineSimilarity,
} from '../skillSearch/localSearch.js'
import { isDeferredTool } from '@claude-code-best/builtin-tools/tools/SearchExtraToolsTool/prompt.js'

export interface ToolIndexEntry {
  name: string
  normalizedName: string
  description: string
  searchHint: string | undefined
  isMcp: boolean
  isDeferred: boolean
  inputSchema: object | undefined
  tokens: string[]
  tfVector: Map<string, number>
}

export interface SearchExtraToolsResult {
  name: string
  description: string
  searchHint: string | undefined
  score: number
  isMcp: boolean
  isDeferred: boolean
  inputSchema: object | undefined
}

const TOOL_FIELD_WEIGHT = {
  name: 3.0,
  searchHint: 2.5,
  description: 1.0,
} as const

const SEARCH_EXTRA_TOOLS_DISPLAY_MIN_SCORE = Number(
  process.env.SEARCH_EXTRA_TOOLS_DISPLAY_MIN_SCORE ?? '0.10',
)

const CJK_MIN_BIGRAM_MATCHES = 2

const CJK_RANGE = /[\u4e00-\u9fff\u3400-\u4dbf]/

function isCjk(ch: string): boolean {
  return CJK_RANGE.test(ch)
}

export function parseToolName(name: string): {
  parts: string[]
  full: string
  isMcp: boolean
} {
  if (name.startsWith('mcp__')) {
    const withoutPrefix = name.replace(/^mcp__/, '').toLowerCase()
    const parts = withoutPrefix.split('__').flatMap(p => p.split('_'))
    return {
      parts: parts.filter(Boolean),
      full: withoutPrefix.replace(/__/g, ' ').replace(/_/g, ' '),
      isMcp: true,
    }
  }

  const parts = name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)

  return {
    parts,
    full: parts.join(' '),
    isMcp: false,
  }
}

export async function buildToolIndex(tools: Tools): Promise<ToolIndexEntry[]> {
  const deferredTools = tools.filter(t => isDeferredTool(t))

  const entries: ToolIndexEntry[] = []
  for (const tool of deferredTools) {
    let description = ''
    try {
      description = await tool.prompt({
        getToolPermissionContext: async () => ({
          mode: 'default' as const,
          additionalWorkingDirectories: new Map(),
          alwaysAllowRules: {},
          alwaysDenyRules: {},
          alwaysAskRules: {},
          isBypassPermissionsModeAvailable: false,
        }),
        tools,
        agents: [],
      })
    } catch {
      description = ''
    }

    const { parts: nameParts, full: normalizedName } = parseToolName(tool.name)
    const searchHint = tool.searchHint ?? ''
    const nameTokens = tokenizeAndStem(nameParts.join(' '))
    const hintTokens = tokenizeAndStem(searchHint)
    const descTokens = tokenizeAndStem(description)

    const allTokens = [
      ...new Set([...nameTokens, ...hintTokens, ...descTokens]),
    ]

    const tfVector = computeWeightedTf([
      { tokens: nameTokens, weight: TOOL_FIELD_WEIGHT.name },
      { tokens: hintTokens, weight: TOOL_FIELD_WEIGHT.searchHint },
      { tokens: descTokens, weight: TOOL_FIELD_WEIGHT.description },
    ])

    let inputSchema: object | undefined
    if (tool.inputJSONSchema) {
      inputSchema = tool.inputJSONSchema
    }

    entries.push({
      name: tool.name,
      normalizedName,
      description,
      searchHint: tool.searchHint,
      isMcp: tool.isMcp === true,
      isDeferred: true,
      inputSchema,
      tokens: allTokens,
      tfVector,
    })
  }

  const idf = computeIdf(entries)

  for (const entry of entries) {
    for (const [term, tf] of entry.tfVector) {
      entry.tfVector.set(term, tf * (idf.get(term) ?? 0))
    }
  }

  logForDebugging(
    `[search-extra-tools] indexed ${entries.length} deferred tools from ${tools.length} total tools`,
  )
  return entries
}

export function searchTools(
  query: string,
  index: ToolIndexEntry[],
  limit = 5,
): SearchExtraToolsResult[] {
  if (index.length === 0 || !query.trim()) return []

  const queryTokens = tokenizeAndStem(query)
  if (queryTokens.length === 0) return []

  const queryTf = new Map<string, number>()
  const freq = new Map<string, number>()
  for (const t of queryTokens) freq.set(t, (freq.get(t) ?? 0) + 1)
  let max = 1
  for (const v of freq.values()) if (v > max) max = v
  for (const [term, count] of freq) queryTf.set(term, count / max)

  const idf = computeIdf(index)
  const queryTfIdf = new Map<string, number>()
  for (const [term, tf] of queryTf) {
    queryTfIdf.set(term, tf * (idf.get(term) ?? 0))
  }

  const queryCjkTokens = queryTokens.filter(t => isCjk(t[0] ?? ''))
  const queryAsciiTokens = queryTokens.filter(t => !isCjk(t[0] ?? ''))
  const queryLower = query.toLowerCase().replace(/[-_]/g, ' ')

  const results: SearchExtraToolsResult[] = []
  for (const entry of index) {
    let score = cosineSimilarity(queryTfIdf, entry.tfVector)

    if (queryCjkTokens.length > 0 && score > 0) {
      const matchingCjk = queryCjkTokens.filter(t => entry.tfVector.has(t))
      if (matchingCjk.length < CJK_MIN_BIGRAM_MATCHES) {
        const hasAsciiMatch = queryAsciiTokens.some(t => entry.tfVector.has(t))
        if (!hasAsciiMatch) score = 0
      }
    }

    if (queryLower.includes(entry.normalizedName)) {
      score = Math.max(score, 0.75)
    }

    if (score >= SEARCH_EXTRA_TOOLS_DISPLAY_MIN_SCORE) {
      results.push({
        name: entry.name,
        description: entry.description,
        searchHint: entry.searchHint,
        score,
        isMcp: entry.isMcp,
        isDeferred: entry.isDeferred,
        inputSchema: entry.inputSchema,
      })
    }
  }

  results.sort((a, b) => b.score - a.score)
  return results.slice(0, limit)
}

let cachedIndex: ToolIndexEntry[] | null = null
let cachedToolNames: string | null = null

export async function getToolIndex(tools: Tools): Promise<ToolIndexEntry[]> {
  const currentKey = tools
    .map(t => t.name)
    .sort()
    .join(',')

  if (cachedIndex && cachedToolNames === currentKey) {
    return cachedIndex
  }

  cachedIndex = await buildToolIndex(tools)
  cachedToolNames = currentKey
  return cachedIndex
}

export function clearToolIndexCache(): void {
  cachedIndex = null
  cachedToolNames = null
  logForDebugging('[search-extra-tools] index cache cleared')
}
