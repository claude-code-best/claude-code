import { z } from 'zod/v4'
import type { ToolResultBlockParam } from 'src/Tool.js'
import { buildTool } from 'src/Tool.js'
import { lazySchema } from 'src/utils/lazySchema.js'

const WEB_BROWSER_TOOL_NAME = 'WebBrowser'

const inputSchema = lazySchema(() =>
  z.strictObject({
    url: z
      .string()
      .describe('URL to fetch and extract content from.'),
    action: z
      .enum(['navigate', 'screenshot'])
      .optional()
      .describe('Action to perform. "navigate" fetches page content (default). "screenshot" returns a text snapshot of the page.'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>
type BrowserInput = z.infer<InputSchema>

type BrowserOutput = {
  title: string
  url: string
  content?: string
  screenshot?: string
}

export const WebBrowserTool = buildTool({
  name: WEB_BROWSER_TOOL_NAME,
  searchHint: 'web browser navigate url page screenshot click',
  maxResultSizeChars: 100_000,
  strict: true,

  get inputSchema(): InputSchema {
    return inputSchema()
  },

  async description() {
    return 'Fetch and read web page content via HTTP'
  },
  async prompt() {
    return `Fetch web pages via HTTP and extract their text content. This is a lightweight browser tool (HTTP fetch, not a full browser engine).

Supported actions:
- navigate: Fetch a URL and extract page title + text content
- screenshot: Same as navigate (returns text snapshot, not a visual screenshot)

Limitations:
- No JavaScript execution — only sees server-rendered HTML
- click/type/scroll require a full browser runtime (not available)
- For full browser interaction, use the Claude-in-Chrome MCP tools instead

Use this for:
- Reading web page content and documentation
- Checking API endpoints that return HTML
- Quick page title/content extraction`
  },

  isConcurrencySafe() {
    return false
  },
  isReadOnly() {
    return true
  },

  userFacingName() {
    return 'Browser'
  },

  renderToolUseMessage(input: Partial<BrowserInput>) {
    const action = input.action ?? 'navigate'
    return `Browser ${action}: ${input.url ?? '...'}`
  },

  mapToolResultToToolResultBlockParam(
    content: BrowserOutput,
    toolUseID: string,
  ): ToolResultBlockParam {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: `${content.title} (${content.url})\n${content.content ?? ''}`,
    }
  },

  async call(input: BrowserInput) {
    const action = input.action ?? 'navigate'

    if (action === 'navigate' || action === 'screenshot') {
      // Fetch the page content via HTTP
      try {
        const response = await fetch(input.url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
          redirect: 'follow',
        })

        if (!response.ok) {
          return {
            data: {
              title: `HTTP ${response.status}`,
              url: input.url,
              content: `Error: ${response.status} ${response.statusText}`,
            },
          }
        }

        const html = await response.text()

        // Extract title
        const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i)
        const title = titleMatch?.[1]?.trim() ?? ''

        // Extract text content (strip HTML tags, scripts, styles)
        let textContent = html
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()

        // Truncate to reasonable size
        if (textContent.length > 50_000) {
          textContent = textContent.slice(0, 50_000) + '\n[truncated]'
        }

        if (action === 'screenshot') {
          return {
            data: {
              title,
              url: response.url,
              content: `[Text snapshot — visual screenshots require Chrome browser tools]\n\n${textContent}`,
            },
          }
        }

        return {
          data: {
            title,
            url: response.url,
            content: textContent,
          },
        }
      } catch (err) {
        return {
          data: {
            title: 'Error',
            url: input.url,
            content: `Failed to fetch: ${err instanceof Error ? err.message : String(err)}`,
          },
        }
      }
    }

    // Unreachable — schema only allows navigate/screenshot
    return {
      data: {
        title: '',
        url: input.url,
        content: `Unknown action "${action}".`,
      },
    }
  },
})
