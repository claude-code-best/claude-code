import { z } from 'zod/v4'
import type { ToolResultBlockParam } from 'src/Tool.js'
import { buildTool } from 'src/Tool.js'
import { lazySchema } from 'src/utils/lazySchema.js'

const WEB_BROWSER_TOOL_NAME = 'WebBrowser'

const inputSchema = lazySchema(() =>
  z.strictObject({
    url: z
      .string()
      .describe('URL to navigate to in the browser.'),
    action: z
      .enum(['navigate', 'screenshot', 'click', 'type', 'scroll'])
      .optional()
      .describe('Browser action to perform. Defaults to "navigate".'),
    selector: z
      .string()
      .optional()
      .describe('CSS selector for click/type actions.'),
    text: z
      .string()
      .optional()
      .describe('Text to type when action is "type".'),
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
    return 'Browse the web using an embedded browser'
  },
  async prompt() {
    return `Open and interact with web pages in an embedded browser. Supports navigation, screenshots, clicking, typing, and scrolling.

Use this for:
- Viewing web pages and their content
- Taking screenshots of UI
- Interacting with web applications
- Testing web endpoints with full browser rendering`
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
    // Browser integration requires the WEB_BROWSER_TOOL runtime (Bun WebView).
    return {
      data: {
        title: '',
        url: input.url,
        content: 'Web browser requires the WEB_BROWSER_TOOL runtime.',
      },
    }
  },
})
