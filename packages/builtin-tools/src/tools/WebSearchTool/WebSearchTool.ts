import type { PermissionResult } from 'src/utils/permissions/PermissionResult.js'
import { z } from 'zod/v4'
import { buildTool, type ToolDef } from 'src/Tool.js'
import { lazySchema } from 'src/utils/lazySchema.js'
import { jsonStringify } from 'src/utils/slowOperations.js'
import { createAdapter } from './adapters/index.js'
import { getWebSearchPrompt, WEB_SEARCH_TOOL_NAME } from './prompt.js'
import {
  getToolUseSummary,
  renderToolResultMessage,
  renderToolUseMessage,
  renderToolUseProgressMessage,
} from './UI.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    query: z.string().min(2).describe('要使用的搜索查询'),
    allowed_domains: z
      .array(z.string())
      .optional()
      .describe('仅包含来自这些域名的搜索结果'),
    blocked_domains: z
      .array(z.string())
      .optional()
      .describe('绝不包含来自这些域名的搜索结果'),
    num_results: z
      .number()
      .optional()
      .describe('要返回的搜索结果数量（默认：8）'),
    livecrawl: z
      .enum(['fallback', 'preferred'])
      .optional()
      .describe(
        "实时抓取模式 - 'fallback'：如果缓存内容不可用，则使用实时抓取作为后备；'preferred'：优先使用实时抓取（默认：'fallback'）",
      ),
    search_type: z
      .enum(['auto', 'fast', 'deep'])
      .optional()
      .describe(
        "搜索类型 - 'auto'：平衡搜索（默认），'fast'：快速结果，'deep'：全面搜索",
      ),
    context_max_characters: z
      .number()
      .optional()
      .describe(
        'Maximum characters for context string optimized for LLMs (default: 10000)',
      ),
  }),
)

type InputSchema = ReturnType<typeof inputSchema>

const searchResultSchema = lazySchema(() => {
  const searchHitSchema = z.object({
    title: z.string().describe('The title of the search result'),
    url: z.string().describe('The URL of the search result'),
    snippet: z
      .string()
      .optional()
      .describe('A short description of the search result'),
  })

  return z.object({
    tool_use_id: z.string().describe('工具使用的 ID'),
    content: z.array(searchHitSchema).describe('搜索结果数组'),
  })
})

export type SearchResult = z.infer<ReturnType<typeof searchResultSchema>>

const outputSchema = lazySchema(() =>
  z.object({
    query: z.string().describe('已执行的搜索查询'),
    results: z
      .array(z.union([searchResultSchema(), z.string()]))
      .describe('搜索结果和/或模型的文本评论'),
    durationSeconds: z.number().describe('完成搜索操作所花费的时间'),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

// 从集中类型重新导出 WebSearchProgress 以打破导入循环
export type { WebSearchProgress } from 'src/types/tools.js'

import type { WebSearchProgress } from 'src/types/tools.js'

export const WebSearchTool = buildTool({
  name: WEB_SEARCH_TOOL_NAME,
  searchHint: '搜索网络以获取当前信息',
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  async description(input) {
    return `Claude 想要搜索网络：${input.query}`
  },
  userFacingName() {
    return '网络搜索'
  },
  getToolUseSummary,
  getActivityDescription(input) {
    const summary = getToolUseSummary(input)
    return summary ? `正在搜索 ${summary}` : '正在搜索网络'
  },
  isEnabled() {
    // 始终启用 — 适配器工厂根据提供者能力选择合适的后端
    // （API 服务端搜索或 Bing 回退）
    return true
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },
  toAutoClassifierInput(input) {
    return input.query
  },
  async checkPermissions(_input): Promise<PermissionResult> {
    return {
      behavior: 'passthrough',
      message: 'WebSearchTool 需要权限。',
      suggestions: [
        {
          type: 'addRules',
          rules: [{ toolName: WEB_SEARCH_TOOL_NAME }],
          behavior: 'allow',
          destination: 'localSettings',
        },
      ],
    }
  },
  async prompt() {
    return getWebSearchPrompt()
  },
  renderToolUseMessage,
  renderToolUseProgressMessage,
  renderToolResultMessage,
  extractSearchText() {
    return ''
  },
  async validateInput(input) {
    const { query, allowed_domains, blocked_domains } = input
    if (!query.length) {
      return {
        result: false,
        message: '错误：缺少查询',
        errorCode: 1,
      }
    }
    if (allowed_domains?.length && blocked_domains?.length) {
      return {
        result: false,
        message:
          '错误：不能在同一个请求中同时指定 allowed_domains 和 blocked_domains',
        errorCode: 2,
      }
    }
    return { result: true }
  },
  async call(input, context, _canUseTool, _parentMessage, onProgress) {
    const startTime = performance.now()
    const { query } = input

    const adapter = createAdapter()
    const adapterResults = await adapter.search(query, {
      allowedDomains: input.allowed_domains,
      blockedDomains: input.blocked_domains,
      numResults: input.num_results,
      livecrawl: input.livecrawl,
      searchType: input.search_type,
      contextMaxCharacters: input.context_max_characters,
      signal: context.abortController.signal,
      onProgress(progress) {
        if (onProgress) {
          const progressCounter = Date.now()
          onProgress({
            toolUseID: `search-progress-${progressCounter}`,
            data: progress,
          })
        }
      },
    })

    const endTime = performance.now()
    const durationSeconds = (endTime - startTime) / 1000

    // 将适配器的 SearchResult[] 转换为旧的输出格式
    const results: (SearchResult | string)[] = []
    if (adapterResults.length > 0) {
      results.push({
        tool_use_id: 'adapter-search-1',
        content: adapterResults.map(r => ({
          title: r.title,
          url: r.url,
          snippet: r.snippet,
        })),
      })
    } else {
      results.push('未找到搜索结果。')
    }

    const data: Output = {
      query,
      results,
      durationSeconds,
    }
    return { data }
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    const { query, results } = output

    let formattedOutput = `“${query}”的网络搜索结果：\n\n`

    ;(results ?? []).forEach(result => {
      if (result == null) {
        return
      }
      if (typeof result === 'string') {
        formattedOutput += result + '\n\n'
      } else {
        if (result.content?.length > 0) {
          formattedOutput += '链接：\n'
          for (const link of result.content) {
            formattedOutput += `  - [${link.title}](${link.url})`
            if (link.snippet) {
              formattedOutput += `：${link.snippet}`
            }
            formattedOutput += '\n'
          }
          formattedOutput += '\n'
        } else {
          formattedOutput += '未找到链接。\n\n'
        }
      }
    })

    formattedOutput +=
      '\n提醒：您必须在回复用户时使用 Markdown 超链接包含上述来源。'

    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: formattedOutput.trim(),
    }
  },
} satisfies ToolDef<InputSchema, Output, WebSearchProgress>)
