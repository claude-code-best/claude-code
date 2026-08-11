import { stat, readFile } from 'fs/promises'
import { z } from 'zod/v4'
import type { ToolResultBlockParam } from 'src/Tool.js'
import { buildTool } from 'src/Tool.js'
import { lazySchema } from 'src/utils/lazySchema.js'
import {
  ARTIFACT_TOOL_NAME,
  describeArtifactTool,
  getArtifactToolPrompt,
} from './prompt.js'
import { getArtifactsToken, getUploadUrl } from './config.js'
import { uploadArtifact } from './client.js'
import { markdownToHtml } from './markdown.js'
import { renderToolResultMessage } from './UI.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    file_path: z
      .string()
      .describe(
        'Absolute path to a local HTML (.html/.htm) or Markdown (.md/.markdown) file to upload. Markdown is converted to styled HTML before upload.',
      ),
    hash: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,128}$/, 'must match ^[A-Za-z0-9_-]{1,128}$')
      .optional()
      .describe(
        'If provided, overwrites the existing artifact with this hash (URL stays stable). If omitted, a new random id is generated.',
      ),
    ttl: z
      .union([z.literal(7), z.literal(30)])
      .default(7)
      .describe('Lifetime in days. Must be 7 or 30. Default 7.'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>
type ArtifactInput = z.infer<InputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    id: z.string(),
    url: z.string(),
    expiresAt: z.string(),
    error: z.string().optional(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>
export type ArtifactOutput = z.infer<OutputSchema>

export const ArtifactTool = buildTool({
  name: ARTIFACT_TOOL_NAME,
  searchHint:
    'upload html markdown artifact share url cloud publish progress report public link',
  maxResultSizeChars: 2_000,
  shouldDefer: true,
  strict: true,

  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },

  async description() {
    return describeArtifactTool()
  },
  async prompt() {
    return getArtifactToolPrompt()
  },

  isEnabled() {
    return true
  },
  isConcurrencySafe() {
    return false
  },
  isReadOnly() {
    return false
  },
  requiresUserInteraction() {
    return true
  },
  userFacingName() {
    return 'Artifact'
  },

  renderToolUseMessage(input: Partial<ArtifactInput>) {
    const hashPart = input.hash ? ` (hash=${input.hash})` : ''
    return `Upload artifact: ${input.file_path ?? '...'}${hashPart}`
  },

  mapToolResultToToolResultBlockParam(
    content: ArtifactOutput,
    toolUseID: string,
  ): ToolResultBlockParam {
    if (content.error) {
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        is_error: true,
        content: content.error,
      }
    }
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: `Artifact uploaded: ${content.url} (id: ${content.id}, expires: ${content.expiresAt})`,
    }
  },
  renderToolResultMessage,

  async call(input: ArtifactInput) {
    const { file_path, hash, ttl } = input

    let size: number
    try {
      const fileStat = await stat(file_path)
      if (!fileStat.isFile()) {
        return {
          data: {
            id: '',
            url: '',
            expiresAt: '',
            error: `Path is not a regular file: ${file_path}`,
          },
        }
      }
      size = fileStat.size
    } catch {
      return {
        data: {
          id: '',
          url: '',
          expiresAt: '',
          error: `File does not exist or is not readable: ${file_path}`,
        },
      }
    }

    if (size > 10 * 1024 * 1024) {
      return {
        data: {
          id: '',
          url: '',
          expiresAt: '',
          error: `File is ${size} bytes; backend limit is 10MB.`,
        },
      }
    }

    let rawContent: string
    try {
      rawContent = await readFile(file_path, 'utf8')
    } catch {
      return {
        data: {
          id: '',
          url: '',
          expiresAt: '',
          error: `Failed to read file: ${file_path}`,
        },
      }
    }

    const lowerPath = file_path.toLowerCase()
    let html: string
    if (lowerPath.endsWith('.html') || lowerPath.endsWith('.htm')) {
      html = rawContent
    } else if (lowerPath.endsWith('.md') || lowerPath.endsWith('.markdown')) {
      html = markdownToHtml(rawContent, file_path)
    } else {
      return {
        data: {
          id: '',
          url: '',
          expiresAt: '',
          error: `Unsupported file extension. Accepted: .html, .htm, .md, .markdown — got: ${file_path}`,
        },
      }
    }

    try {
      const result = await uploadArtifact({
        html,
        token: getArtifactsToken(),
        uploadUrl: getUploadUrl(),
        hash,
        ttl,
      })
      return { data: result }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return { data: { id: '', url: '', expiresAt: '', error: message } }
    }
  },
})
