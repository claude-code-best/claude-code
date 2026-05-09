import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import memoize from 'lodash-es/memoize.js'
import { z } from 'zod/v4'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js'
import {
  buildTool,
  findToolByName,
  type Tool,
  type ToolDef,
  type Tools,
} from 'src/Tool.js'
import { logForDebugging } from 'src/utils/debug.js'
import { lazySchema } from 'src/utils/lazySchema.js'
import { escapeRegExp } from 'src/utils/stringUtils.js'
import { isToolSearchEnabledOptimistic } from 'src/utils/toolSearch.js'
import { getPrompt, isDeferredTool, TOOL_SEARCH_TOOL_NAME } from './prompt.js'
import { getToolIndex, searchTools } from 'src/services/toolSearch/toolIndex.js'
import type { ToolSearchResult } from 'src/services/toolSearch/toolIndex.js'

const KEYWORD_WEIGHT = Number(process.env.TOOL_SEARCH_WEIGHT_KEYWORD ?? '0.4')
const TFIDF_WEIGHT = Number(process.env.TOOL_SEARCH_WEIGHT_TFIDF ?? '0.6')

export const inputSchema = lazySchema(() =>
  z.object({
    query: z
      .string()
      .describe(
        'Query to find deferred tools. Use "select:<tool_name>" for direct selection, or keywords to search.',
      ),
    max_results: z
      .number()
      .optional()
      .default(5)
      .describe('Maximum number of results to return (default: 5)'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

export const outputSchema = lazySchema(() =>
  z.object({
    matches: z.array(z.string()),
    query: z.string(),
    total_deferred_tools: z.number(),
    pending_mcp_servers: z.array(z.string()).optional(),
    /** Matches that are already loaded (core tools) and can be called directly. */
    already_loaded: z.array(z.string()).optional(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

// Track deferred tool names to detect when cache should be cleared
let cachedDeferredToolNames: string | null = null

/**
 * Get a cache key representing the current set of deferred tools.
 */
function getDeferredToolsCacheKey(deferredTools: Tools): string {
  return deferredTools
    .map(t => t.name)
    .sort()
    .join(',')
}

/**
 * Get tool description, memoized by tool name.
 * Used for keyword search scoring.
 */
const getToolDescriptionMemoized = memoize(
  async (toolName: string, tools: Tools): Promise<string> => {
    const tool = findToolByName(tools, toolName)
    if (!tool) {
      return ''
    }
    return tool.prompt({
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
  },
  (toolName: string) => toolName,
)

/**
 * Invalidate the description cache if deferred tools have changed.
 */
function maybeInvalidateCache(deferredTools: Tools): void {
  const currentKey = getDeferredToolsCacheKey(deferredTools)
  if (cachedDeferredToolNames !== currentKey) {
    logForDebugging(
      `ToolSearchTool: cache invalidated - deferred tools changed`,
    )
    getToolDescriptionMemoized.cache.clear?.()
    cachedDeferredToolNames = currentKey
  }
}

export function clearToolSearchDescriptionCache(): void {
  getToolDescriptionMemoized.cache.clear?.()
  cachedDeferredToolNames = null
}

/**
 * Build the search result output structure.
 */
function buildSearchResult(
  matches: string[],
  query: string,
  totalDeferredTools: number,
  pendingMcpServers?: string[],
  alreadyLoaded?: string[],
): { data: Output } {
  return {
    data: {
      matches,
      query,
      total_deferred_tools: totalDeferredTools,
      ...(pendingMcpServers && pendingMcpServers.length > 0
        ? { pending_mcp_servers: pendingMcpServers }
        : {}),
      ...(alreadyLoaded && alreadyLoaded.length > 0
        ? { already_loaded: alreadyLoaded }
        : {}),
    },
  }
}

/**
 * Parse tool name into searchable parts.
 * Handles both MCP tools (mcp__server__action) and regular tools (CamelCase).
 */
function parseToolName(name: string): {
  parts: string[]
  full: string
  isMcp: boolean
} {
  // Check if it's an MCP tool
  if (name.startsWith('mcp__')) {
    const withoutPrefix = name.replace(/^mcp__/, '').toLowerCase()
    const parts = withoutPrefix.split('__').flatMap(p => p.split('_'))
    return {
      parts: parts.filter(Boolean),
      full: withoutPrefix.replace(/__/g, ' ').replace(/_/g, ' '),
      isMcp: true,
    }
  }

  // Regular tool - split by CamelCase and underscores
  const parts = name
    .replace(/([a-z])([A-Z])/g, '$1 $2') // CamelCase to spaces
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

/**
 * Pre-compile word-boundary regexes for all search terms.
 * Called once per search instead of tools×terms×2 times.
 */
function compileTermPatterns(terms: string[]): Map<string, RegExp> {
  const patterns = new Map<string, RegExp>()
  for (const term of terms) {
    if (!patterns.has(term)) {
      patterns.set(term, new RegExp(`\\b${escapeRegExp(term)}\\b`))
    }
  }
  return patterns
}

/**
 * Keyword-based search over tool names and descriptions.
 * Handles both MCP tools (mcp__server__action) and regular tools (CamelCase).
 *
 * The model typically queries with:
 * - Server names when it knows the integration (e.g., "slack", "github")
 * - Action words when looking for functionality (e.g., "read", "list", "create")
 * - Tool-specific terms (e.g., "notebook", "shell", "kill")
 */
async function searchToolsWithKeywords(
  query: string,
  deferredTools: Tools,
  tools: Tools,
  maxResults: number,
): Promise<string[]> {
  const queryLower = query.toLowerCase().trim()

  // Fast path: if query matches a tool name exactly, return it directly.
  // Handles models using a bare tool name instead of select: prefix (seen
  // from subagents/post-compaction). Checks deferred first, then falls back
  // to the full tool set — selecting an already-loaded tool is a harmless
  // no-op that lets the model proceed without retry churn.
  const exactMatch =
    deferredTools.find(t => t.name.toLowerCase() === queryLower) ??
    tools.find(t => t.name.toLowerCase() === queryLower)
  if (exactMatch) {
    return [exactMatch.name]
  }

  // If query looks like an MCP tool prefix (mcp__server), find matching tools.
  // Handles models searching by server name with mcp__ prefix.
  if (queryLower.startsWith('mcp__') && queryLower.length > 5) {
    const prefixMatches = deferredTools
      .filter(t => t.name.toLowerCase().startsWith(queryLower))
      .slice(0, maxResults)
      .map(t => t.name)
    if (prefixMatches.length > 0) {
      return prefixMatches
    }
  }

  const queryTerms = queryLower.split(/\s+/).filter(term => term.length > 0)

  // Partition into required (+prefixed) and optional terms
  const requiredTerms: string[] = []
  const optionalTerms: string[] = []
  for (const term of queryTerms) {
    if (term.startsWith('+') && term.length > 1) {
      requiredTerms.push(term.slice(1))
    } else {
      optionalTerms.push(term)
    }
  }

  const allScoringTerms =
    requiredTerms.length > 0 ? [...requiredTerms, ...optionalTerms] : queryTerms
  const termPatterns = compileTermPatterns(allScoringTerms)

  // Pre-filter to tools matching ALL required terms in name or description
  let candidateTools = deferredTools
  if (requiredTerms.length > 0) {
    const matches = await Promise.all(
      deferredTools.map(async tool => {
        const parsed = parseToolName(tool.name)
        const description = await getToolDescriptionMemoized(tool.name, tools)
        const descNormalized = description.toLowerCase()
        const hintNormalized = tool.searchHint?.toLowerCase() ?? ''
        const matchesAll = requiredTerms.every(term => {
          const pattern = termPatterns.get(term)!
          return (
            parsed.parts.includes(term) ||
            parsed.parts.some(part => part.includes(term)) ||
            pattern.test(descNormalized) ||
            (hintNormalized && pattern.test(hintNormalized))
          )
        })
        return matchesAll ? tool : null
      }),
    )
    candidateTools = matches.filter((t): t is Tool => t !== null)
  }

  const scored = await Promise.all(
    candidateTools.map(async tool => {
      const parsed = parseToolName(tool.name)
      const description = await getToolDescriptionMemoized(tool.name, tools)
      const descNormalized = description.toLowerCase()
      const hintNormalized = tool.searchHint?.toLowerCase() ?? ''

      let score = 0
      for (const term of allScoringTerms) {
        const pattern = termPatterns.get(term)!

        // Exact part match (high weight for MCP server names, tool name parts)
        if (parsed.parts.includes(term)) {
          score += parsed.isMcp ? 12 : 10
        } else if (parsed.parts.some(part => part.includes(term))) {
          score += parsed.isMcp ? 6 : 5
        }

        // Full name fallback (for edge cases)
        if (parsed.full.includes(term) && score === 0) {
          score += 3
        }

        // searchHint match — curated capability phrase, higher signal than prompt
        if (hintNormalized && pattern.test(hintNormalized)) {
          score += 4
        }

        // Description match - use word boundary to avoid false positives
        if (pattern.test(descNormalized)) {
          score += 2
        }
      }

      return { name: tool.name, score }
    }),
  )

  return scored
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(item => item.name)
}

export const ToolSearchTool = buildTool({
  isEnabled() {
    return isToolSearchEnabledOptimistic()
  },
  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },
  name: TOOL_SEARCH_TOOL_NAME,
  maxResultSizeChars: 100_000,
  async description() {
    return getPrompt()
  },
  async prompt() {
    return getPrompt()
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  async call(input, { options: { tools }, getAppState }) {
    const { query, max_results = 5 } = input

    const deferredTools = tools.filter(isDeferredTool)
    maybeInvalidateCache(deferredTools)

    // Check for MCP servers still connecting
    function getPendingServerNames(): string[] | undefined {
      const appState = getAppState()
      const pending = appState.mcp.clients.filter(c => c.type === 'pending')
      return pending.length > 0 ? pending.map(s => s.name) : undefined
    }

    // Helper to log search outcome
    function logSearchOutcome(
      matches: string[],
      queryType: 'select' | 'keyword',
    ): void {
      logEvent('tengu_tool_search_outcome', {
        query:
          query as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        queryType:
          queryType as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        matchCount: matches.length,
        totalDeferredTools: deferredTools.length,
        maxResults: max_results,
        hasMatches: matches.length > 0,
      })
    }

    // Check for select: prefix — direct tool selection.
    // Supports comma-separated multi-select: `select:A,B,C`.
    // If a name isn't in the deferred set but IS in the full tool set,
    // we still return it — the tool is already loaded, so "selecting" it
    // is a harmless no-op that lets the model proceed without retry churn.
    const selectMatch = query.match(/^select:(.+)$/i)
    if (selectMatch) {
      const requested = selectMatch[1]!
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)

      const found: string[] = []
      const alreadyLoaded: string[] = []
      const missing: string[] = []
      for (const toolName of requested) {
        const deferredMatch = findToolByName(deferredTools, toolName)
        const fullMatch = deferredMatch ?? findToolByName(tools, toolName)
        if (fullMatch) {
          if (!found.includes(fullMatch.name)) {
            found.push(fullMatch.name)
            if (!deferredMatch) {
              alreadyLoaded.push(fullMatch.name)
            }
          }
        } else {
          missing.push(toolName)
        }
      }

      if (found.length === 0) {
        logForDebugging(
          `ToolSearchTool: select failed — none found: ${missing.join(', ')}`,
        )
        logSearchOutcome([], 'select')
        const pendingServers = getPendingServerNames()
        return buildSearchResult(
          [],
          query,
          deferredTools.length,
          pendingServers,
        )
      }

      if (missing.length > 0) {
        logForDebugging(
          `ToolSearchTool: partial select — found: ${found.join(', ')}, missing: ${missing.join(', ')}`,
        )
      } else {
        logForDebugging(`ToolSearchTool: selected ${found.join(', ')}`)
      }
      logSearchOutcome(found, 'select')
      return buildSearchResult(
        found,
        query,
        deferredTools.length,
        undefined,
        alreadyLoaded.length > 0 ? alreadyLoaded : undefined,
      )
    }

    // Check for discover: prefix — pure discovery search.
    // Returns tool info (name + description + schema) as text,
    // does NOT trigger deferred tool loading.
    const discoverMatch = query.match(/^discover:(.+)$/i)
    if (discoverMatch) {
      const discoverQuery = discoverMatch[1]!.trim()
      const index = await getToolIndex(deferredTools)
      const tfIdfResults = searchTools(discoverQuery, index, max_results)
      const textResults = tfIdfResults.map(r => {
        let line = `**${r.name}** (score: ${r.score.toFixed(2)})\n${r.description}`
        if (r.inputSchema) {
          line += `\nSchema: ${JSON.stringify(r.inputSchema)}`
        }
        return line
      })
      const text =
        textResults.length > 0
          ? `Found ${textResults.length} tools:\n${textResults.join('\n\n')}`
          : 'No matching deferred tools found'
      logSearchOutcome(
        tfIdfResults.map(r => r.name),
        'keyword',
      )
      return buildSearchResult(
        tfIdfResults.map(r => r.name),
        query,
        deferredTools.length,
      )
    }

    // Keyword search + TF-IDF search in parallel
    const deferredToolNames = new Set(deferredTools.map(t => t.name))
    const [keywordMatches, index] = await Promise.all([
      searchToolsWithKeywords(query, deferredTools, tools, max_results),
      getToolIndex(deferredTools),
    ])
    const tfIdfResults = searchTools(query, index, max_results)

    // Merge results: keyword score * 0.4 + TF-IDF score * 0.6
    const mergedScores = new Map<string, number>()
    // Add keyword results (assign scores inversely proportional to rank)
    keywordMatches.forEach((name, rank) => {
      const score = (keywordMatches.length - rank) / keywordMatches.length
      mergedScores.set(
        name,
        (mergedScores.get(name) ?? 0) + score * KEYWORD_WEIGHT,
      )
    })
    // Add TF-IDF results
    tfIdfResults.forEach(result => {
      mergedScores.set(
        result.name,
        (mergedScores.get(result.name) ?? 0) + result.score * TFIDF_WEIGHT,
      )
    })

    // Sort by merged score, take top-N
    const matches = [...mergedScores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, max_results)
      .map(([name]) => name)

    // Identify already-loaded (core) tools among matches
    const alreadyLoaded = matches.filter(name => !deferredToolNames.has(name))

    logForDebugging(
      `ToolSearchTool: keyword search for "${query}", found ${matches.length} matches`,
    )

    logSearchOutcome(matches, 'keyword')

    // Include pending server info when search finds no matches
    if (matches.length === 0) {
      const pendingServers = getPendingServerNames()
      return buildSearchResult(
        matches,
        query,
        deferredTools.length,
        pendingServers,
      )
    }

    return buildSearchResult(
      matches,
      query,
      deferredTools.length,
      undefined,
      alreadyLoaded.length > 0 ? alreadyLoaded : undefined,
    )
  },
  renderToolUseMessage(input: Partial<{ query: string; max_results: number }>) {
    if (!input.query) return null
    return `"${input.query}"`
  },
  userFacingName() {
    return 'ToolSearch'
  },
  /**
   * Returns a tool_result with text output guiding the model to use ExecuteExtraTool.
   * No longer uses tool_reference blocks — unified self-built tool search for all providers.
   */
  mapToolResultToToolResultBlockParam(
    content: Output,
    toolUseID: string,
    _context?: { mainLoopModel?: string },
  ): ToolResultBlockParam {
    if (content.matches.length === 0) {
      let text = 'No matching deferred tools found'
      if (
        content.pending_mcp_servers &&
        content.pending_mcp_servers.length > 0
      ) {
        text += `. Some MCP servers are still connecting: ${content.pending_mcp_servers.join(', ')}. Their tools will become available shortly — try searching again.`
      }
      return {
        type: 'tool_result',
        tool_use_id: toolUseID,
        content: text,
      }
    }

    // Separate already-loaded (core) tools from truly deferred tools
    const alreadyLoadedNames = content.already_loaded ?? []
    const deferredNames = content.matches.filter(
      n => !alreadyLoadedNames.includes(n),
    )

    const parts: string[] = []

    // Core tools: clear "call directly" message, NO ExecuteExtraTool hint
    if (alreadyLoadedNames.length > 0) {
      parts.push(
        `Already loaded as core tool(s): ${alreadyLoadedNames.join(', ')}. Call these directly using your normal tool interface — do NOT use ExecuteExtraTool for them.`,
      )
    }

    // Deferred tools: guide to ExecuteExtraTool
    if (deferredNames.length > 0) {
      parts.push(
        `Found ${deferredNames.length} deferred tool(s): ${deferredNames.join(', ')}.` +
          `\nUse ExecuteExtraTool with {"tool_name": "<name>", "params": {...}} to invoke any of these deferred tools.`,
      )
    }

    const text = parts.join('\n')

    return {
      type: 'tool_result',
      tool_use_id: toolUseID,
      content: text,
    }
  },
} satisfies ToolDef<InputSchema, Output>)
