import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import type { StructuredPatchHunk } from 'diff'
import * as React from 'react'
import { Suspense, use, useState } from 'react'
import { FileEditToolUseRejectedMessage } from 'src/components/FileEditToolUseRejectedMessage.js'
import { MessageResponse } from 'src/components/MessageResponse.js'
import { extractTag } from 'src/utils/messages.js'
import { FallbackToolUseErrorMessage } from 'src/components/FallbackToolUseErrorMessage.js'
import { FileEditToolUpdatedMessage } from 'src/components/FileEditToolUpdatedMessage.js'

import { Text } from '@anthropic/ink'
import { FilePathLink } from 'src/components/FilePathLink.js'
import type { Tools } from 'src/Tool.js'
import type { Message, ProgressMessage } from 'src/types/message.js'
import { adjustHunkLineNumbers, CONTEXT_LINES } from 'src/utils/diff.js'
import { FILE_NOT_FOUND_CWD_NOTE, getDisplayPath } from 'src/utils/file.js'
import { logError } from 'src/utils/log.js'
import { getPlansDirectory } from 'src/utils/plans.js'
import { readEditContext } from 'src/utils/readEditContext.js'
import { firstLineOf } from 'src/utils/stringUtils.js'
import type { ThemeName } from 'src/utils/theme.js'
import type { FileEditOutput } from './types.js'
import {
  findActualString,
  getPatchForEdit,
  preserveQuoteStyle,
} from './utils.js'

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
      firstLine={originalFile.split('\n')[0] ?? null}
      fileContent={originalFile}
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
  options: {
    columns: number
    messages: Message[]
    progressMessagesForMessage: ProgressMessage[]
    style?: 'condensed'
    theme: ThemeName
    tools: Tools
    verbose: boolean
  },
): React.ReactElement {
  const { style, verbose } = options
  const filePath = input.file_path
  const oldString = input.old_string ?? ''
  const newString = input.new_string ?? ''
  const replaceAll = input.replace_all ?? false

  // Defensive: if input has an unexpected shape, show a simple rejection message
  if ('edits' in input && input.edits != null) {
    return (
      <FileEditToolUseRejectedMessage
        file_path={filePath}
        operation="update"
        firstLine={null}
        verbose={verbose}
      />
    )
  }

  const isNewFile = oldString === ''

  // For new file creation, show content preview instead of diff
  if (isNewFile) {
    return (
      <FileEditToolUseRejectedMessage
        file_path={filePath}
        operation="write"
        content={newString}
        firstLine={firstLineOf(newString)}
        verbose={verbose}
      />
    )
  }

  return (
    <EditRejectionDiff
      filePath={filePath}
      oldString={oldString}
      newString={newString}
      replaceAll={replaceAll}
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
    // Show a less scary message for intended behavior
    if (errorMessage?.includes('File has not been read yet')) {
      return (
        <MessageResponse>
          <Text dimColor>File must be read first</Text>
        </MessageResponse>
      )
    }
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

type RejectionDiffData = {
  patch: StructuredPatchHunk[]
  firstLine: string | null
  fileContent: string | undefined
}

function EditRejectionDiff({
  filePath,
  oldString,
  newString,
  replaceAll,
  style,
  verbose,
}: {
  filePath: string
  oldString: string
  newString: string
  replaceAll: boolean
  style?: 'condensed'
  verbose: boolean
}): React.ReactNode {
  const [dataPromise] = useState(() =>
    loadRejectionDiff(filePath, oldString, newString, replaceAll),
  )
  return (
    <Suspense
      fallback={
        <FileEditToolUseRejectedMessage
          file_path={filePath}
          operation="update"
          firstLine={null}
          verbose={verbose}
        />
      }
    >
      <EditRejectionBody
        promise={dataPromise}
        filePath={filePath}
        style={style}
        verbose={verbose}
      />
    </Suspense>
  )
}

function EditRejectionBody({
  promise,
  filePath,
  style,
  verbose,
}: {
  promise: Promise<RejectionDiffData>
  filePath: string
  style?: 'condensed'
  verbose: boolean
}): React.ReactNode {
  const { patch, firstLine, fileContent } = use(promise)
  return (
    <FileEditToolUseRejectedMessage
      file_path={filePath}
      operation="update"
      patch={patch}
      firstLine={firstLine}
      fileContent={fileContent}
      style={style}
      verbose={verbose}
    />
  )
}

async function loadRejectionDiff(
  filePath: string,
  oldString: string,
  newString: string,
  replaceAll: boolean,
): Promise<RejectionDiffData> {
  try {
    // Chunked read — context window around the first occurrence. replaceAll
    // still shows matches *within* the window via getPatchForEdit; we accept
    // losing the all-occurrences view to keep the read bounded.
    const ctx = await readEditContext(filePath, oldString, CONTEXT_LINES)
    if (ctx === null || ctx.truncated || ctx.content === '') {
      // ENOENT / not found / truncated — diff just the tool inputs.
      const { patch } = getPatchForEdit({
        filePath,
        fileContents: oldString,
        oldString,
        newString,
      })
      return { patch, firstLine: null, fileContent: undefined }
    }
    const actualOld = findActualString(ctx.content, oldString) || oldString
    const actualNew = preserveQuoteStyle(oldString, actualOld, newString)
    const { patch } = getPatchForEdit({
      filePath,
      fileContents: ctx.content,
      oldString: actualOld,
      newString: actualNew,
      replaceAll,
    })
    return {
      patch: adjustHunkLineNumbers(patch, ctx.lineOffset - 1),
      firstLine: ctx.lineOffset === 1 ? firstLineOf(ctx.content) : null,
      fileContent: ctx.content,
    }
  } catch (e) {
    // User may have manually applied the change while the diff was shown.
    logError(e as Error)
    return { patch: [], firstLine: null, fileContent: undefined }
  }
}
