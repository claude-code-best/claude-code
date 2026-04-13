import { z } from 'zod/v4'
import type { ToolResultBlockParam } from 'src/Tool.js'
import { buildTool } from 'src/Tool.js'
import { lazySchema } from 'src/utils/lazySchema.js'
import { TERMINAL_CAPTURE_TOOL_NAME } from './prompt.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    lines: z
      .number()
      .optional()
      .describe('Number of lines to capture from the terminal. Defaults to 50.'),
    panel_id: z
      .string()
      .optional()
      .describe('ID of the terminal panel to capture from. Defaults to the active panel.'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>
type CaptureInput = z.infer<InputSchema>

type CaptureOutput = { content: string; line_count: number }

export const TerminalCaptureTool = buildTool({
  name: TERMINAL_CAPTURE_TOOL_NAME,
  searchHint: 'terminal capture screen output panel read',
  maxResultSizeChars: 100_000,
  strict: true,

  get inputSchema(): InputSchema {
    return inputSchema()
  },

  async description() {
    return 'Capture output from a terminal panel'
  },
  async prompt() {
    return `Capture the current content of a terminal panel. Use this to read output from terminal sessions running in the terminal panel UI.

Guidelines:
- Specify the number of lines to capture (default 50)
- Optionally target a specific panel by ID
- Content is returned as plain text`
  },

  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },

  userFacingName() {
    return 'TerminalCapture'
  },

  renderToolUseMessage(input: Partial<CaptureInput>) {
    const lines = input.lines ?? 50
    return `Terminal Capture: ${lines} lines`
  },

  mapToolResultToToolResultBlockParam(
    content: CaptureOutput,
    toolUseID: string,
  ): ToolResultBlockParam {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: content.content || '(empty terminal)',
    }
  },

  async call(input: CaptureInput) {
    // Terminal panel capture is provided by the TERMINAL_PANEL runtime.
    return {
      data: {
        content: '',
        line_count: 0,
      },
    }
  },
})
