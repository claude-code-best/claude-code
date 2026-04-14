import { z } from 'zod/v4'
import type { ToolResultBlockParam } from 'src/Tool.js'
import { buildTool } from 'src/Tool.js'
import { lazySchema } from 'src/utils/lazySchema.js'
import { SEND_USER_FILE_TOOL_NAME } from './prompt.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    file_path: z
      .string()
      .describe('Absolute path to the file to send to the user.'),
    description: z
      .string()
      .optional()
      .describe('Optional description of the file being sent.'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>
type SendUserFileInput = z.infer<InputSchema>

type SendUserFileOutput = { sent: boolean; file_path: string }

export const SendUserFileTool = buildTool({
  name: SEND_USER_FILE_TOOL_NAME,
  searchHint: 'send file to user mobile device upload share',
  maxResultSizeChars: 5_000,
  strict: true,

  get inputSchema(): InputSchema {
    return inputSchema()
  },

  async description() {
    return 'Send a file to the user (KAIROS assistant mode)'
  },
  async prompt() {
    return `Send a file to the user's device. Use this in assistant mode when the user requests a file or when a file is relevant to the conversation.

Guidelines:
- Use absolute paths
- The file must exist and be readable
- Large files may take time to transfer`
  },

  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },

  userFacingName() {
    return 'SendFile'
  },

  renderToolUseMessage(input: Partial<SendUserFileInput>) {
    return `Send file: ${input.file_path ?? '...'}`
  },

  mapToolResultToToolResultBlockParam(
    content: SendUserFileOutput,
    toolUseID: string,
  ): ToolResultBlockParam {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: content.sent
        ? `File sent: ${content.file_path}`
        : `Failed to send file: ${content.file_path}`,
    }
  },

  async call(_input: SendUserFileInput) {
    // File transfer is handled by the KAIROS assistant transport layer.
    // Without the KAIROS runtime, this tool is not available.
    return {
      data: {
        sent: false,
        file_path: _input.file_path,
        error: 'SendUserFile requires the KAIROS assistant transport layer.',
      },
    }
  },
})
