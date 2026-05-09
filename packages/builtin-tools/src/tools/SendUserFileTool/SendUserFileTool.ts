import { z } from 'zod/v4'
import type { ToolResultBlockParam } from 'src/Tool.js'
import { buildTool } from 'src/Tool.js'
import { lazySchema } from 'src/utils/lazySchema.js'
import { SEND_USER_FILE_TOOL_NAME } from './prompt.js'
import { isBridgeEnabled } from 'src/bridge/bridgeEnabled.js'

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

  isEnabled() {
    return isBridgeEnabled()
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

  async call(input: SendUserFileInput, context) {
    const { file_path } = input
    const { stat } = await import('fs/promises')

    // Verify file exists and is readable
    let fileSize: number
    try {
      const fileStat = await stat(file_path)
      if (!fileStat.isFile()) {
        return {
          data: { sent: false, file_path, error: 'Path is not a file.' },
        }
      }
      fileSize = fileStat.size
    } catch {
      return {
        data: {
          sent: false,
          file_path,
          error: 'File does not exist or is not readable.',
        },
      }
    }

    // Attempt bridge upload if available (so web viewers can download)
    const appState = context.getAppState()
    let fileUuid: string | undefined
    if (appState.replBridgeEnabled) {
      try {
        const { uploadBriefAttachment } = await import(
          '@claude-code-best/builtin-tools/tools/BriefTool/upload.js'
        )
        fileUuid = await uploadBriefAttachment(file_path, fileSize, {
          replBridgeEnabled: true,
          signal: context.abortController.signal,
        })
      } catch {
        // Best-effort upload — local path is always available
      }
    }

    const delivered = !appState.replBridgeEnabled || Boolean(fileUuid)
    return {
      data: {
        sent: delivered,
        file_path,
        size: fileSize,
        ...(fileUuid ? { file_uuid: fileUuid } : {}),
        ...(!delivered
          ? { error: 'Bridge upload failed. File available at local path.' }
          : {}),
      },
    }
  },
})
