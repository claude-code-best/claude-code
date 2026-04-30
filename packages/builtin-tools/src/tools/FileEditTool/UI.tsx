import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import * as React from 'react'
import { FileEditToolUseRejectedMessage } from 'src/components/FileEditToolUseRejectedMessage.js'
import { MessageResponse } from 'src/components/MessageResponse.js'
import { extractTag } from 'src/utils/messages.js'
import { FallbackToolUseErrorMessage } from 'src/components/FallbackToolUseErrorMessage.js'
import { FileEditToolUpdatedMessage } from 'src/components/FileEditToolUpdatedMessage.js'

import { Text } from '@anthropic/ink'
import { FilePathLink } from 'src/components/FilePathLink.js'
import type { Tools } from 'src/Tool.js'
import type { Message, ProgressMessage } from 'src/types/message.js'
import { FILE_NOT_FOUND_CWD_NOTE, getDisplayPath } from 'src/utils/file.js'
import { getPlansDirectory } from 'src/utils/plans.js'
import type { ThemeName } from 'src/utils/theme.js'
import type { FileEditOutput } from './types.js'

export function userFacingName(
  input:
    | Partial<{
        file_path: string
        old_string: string
        new_string: string
        replace_all: boolean
        edits: unknown[]
      }>
    | undefined,
): string {
  if (!input) {
    return 'Update'
  }
  if (input.file_path?.startsWith(getPlansDirectory())) {
    return 'Updated plan'
  }
  // Hashline edits always modify an existing file (line-ref based)
  if (input.edits != null) {
    return 'Update'
  }
  if (input.old_string === '') {
    return 'Create'
  }
  return 'Update'
}

export function getToolUseSummary(
  input:
    | Partial<{
        file_path: string
        old_string: string
        new_string: string
        replace_all: boolean
      }>
    | undefined,
): string | null {
  if (!input?.file_path) {
    return null
  }
  return getDisplayPath(input.file_path)
}

export function renderToolUseMessage(
  { file_path }: { file_path?: string },
  { verbose }: { verbose: boolean },
): React.ReactNode {
  if (!file_path) {
    return null
  }
  // For plan files, path is already in userFacingName
  if (file_path.startsWith(getPlansDirectory())) {
    return ''
  }
  return (
    <FilePathLink filePath={file_path}>
      {verbose ? file_path : getDisplayPath(file_path)}
    </FilePathLink>
  )
}

export function renderToolResultMessage(
  { filePath, structuredPatch, originalFile }: FileEditOutput,
  _progressMessagesForMessage: ProgressMessage[],
  { style, verbose }: { style?: 'condensed'; verbose: boolean },
): React.ReactNode {
  // For plan files, show /plan hint above the diff
  const isPlanFile = filePath.startsWith(getPlansDirectory())

  return (
    <FileEditToolUpdatedMessage
      filePath={filePath}
      structuredPatch={structuredPatch}
      style={style}
      verbose={verbose}
      previewHint={isPlanFile ? '/plan to preview' : undefined}
    />
  )
}

export function renderToolUseRejectedMessage(
  input: {
    file_path: string
    old_string?: string
    new_string?: string
    replace_all?: boolean
    edits?: unknown[]
  },
  _options: {
    columns: number
    messages: Message[]
    progressMessagesForMessage: ProgressMessage[]
    style?: 'condensed'
    theme: ThemeName
    tools: Tools
    verbose: boolean
  },
): React.ReactElement {
  const { style, verbose } = _options
  const filePath = input.file_path
  const isNewFile = input.old_string === ''

  return (
    <FileEditToolUseRejectedMessage
      file_path={filePath}
      operation={isNewFile ? 'write' : 'update'}
      style={style}
      verbose={verbose}
    />
  )
}

export function renderToolUseErrorMessage(
  result: ToolResultBlockParam['content'],
  options: {
    progressMessagesForMessage: ProgressMessage[]
    tools: Tools
    verbose: boolean
  },
): React.ReactElement {
  const { verbose } = options
  if (
    !verbose &&
    typeof result === 'string' &&
    extractTag(result, 'tool_use_error')
  ) {
    const errorMessage = extractTag(result, 'tool_use_error')
    if (errorMessage?.includes(FILE_NOT_FOUND_CWD_NOTE)) {
      return (
        <MessageResponse>
          <Text color="error">File not found</Text>
        </MessageResponse>
      )
    }
    return (
      <MessageResponse>
        <Text color="error">Error editing file</Text>
      </MessageResponse>
    )
  }
  return <FallbackToolUseErrorMessage result={result} verbose={verbose} />
}
