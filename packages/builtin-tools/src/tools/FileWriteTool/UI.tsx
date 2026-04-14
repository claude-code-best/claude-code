import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import type { StructuredPatchHunk } from 'diff'
import { isAbsolute, relative, resolve } from 'path'
import * as React from 'react'
import { Suspense, use, useState } from 'react'
import { MessageResponse } from 'src/components/MessageResponse.js'
import { extractTag } from 'src/utils/messages.js'
import { CtrlOToExpand } from 'src/components/CtrlOToExpand.js'
import { FallbackToolUseErrorMessage } from 'src/components/FallbackToolUseErrorMessage.js'
import { FileEditToolUpdatedMessage } from 'src/components/FileEditToolUpdatedMessage.js'
import { FileEditToolUseRejectedMessage } from 'src/components/FileEditToolUseRejectedMessage.js'

import { HighlightedCode } from 'src/components/HighlightedCode.js'
import { useTerminalSize } from 'src/hooks/useTerminalSize.js'
import { Box, Text } from '@anthropic/ink'
import { FilePathLink } from 'src/components/FilePathLink.js'
import type { ToolProgressData } from 'src/Tool.js'
import type { ProgressMessage } from 'src/types/message.js'
import { getCwd } from 'src/utils/cwd.js'
import { getPatchForDisplay } from 'src/utils/diff.js'
import { getDisplayPath } from 'src/utils/file.js'
import { logError } from 'src/utils/log.js'
import { getPlansDirectory } from 'src/utils/plans.js'
import { openForScan, readCapped } from 'src/utils/readEditContext.js'
import type { Output } from './FileWriteTool.js'

const MAX_LINES_TO_RENDER = 10
// Model output uses \n regardless of platform, so always split on \n.
// os.EOL is \r\n on Windows, which would give numLines=1 for all files.
const EOL = '\n'

/**
 * Count visible lines in file content. A trailing newline is treated as a
 * line terminator (not a new empty line), matching editor line numbering.
 */
export function countLines(content: string): number {
  const parts = content.split(EOL)
  return content.endsWith(EOL) ? parts.length - 1 : parts.length
}

function FileWriteToolCreatedMessage({
  filePath,
  content,
  verbose,
}: {
  filePath: string
  content: string
  verbose: boolean
}): React.ReactNode {
  const { columns } = useTerminalSize()
  const contentWithFallback = content || '(No content)'
  const numLines = countLines(content)
  const plusLines = numLines - MAX_LINES_TO_RENDER

  return (
    <MessageResponse>
      <Box flexDirection="column">
        <Text>
          Wrote <Text bold>{numLines}</Text> lines to{' '}
          <Text bold>{verbose ? filePath : relative(getCwd(), filePath)}</Text>
        </Text>
        <Box flexDirection="column">
          <HighlightedCode
            code={
              verbose
                ? contentWithFallback
                : contentWithFallback
                    .split('\n')
                    .slice(0, MAX_LINES_TO_RENDER)
                    .join('\n')
            }
            filePath={filePath}
            width={columns - 12}
          />
        </Box>
        {!verbose && plusLines > 0 && (
          <Text dimColor>
            … +{plusLines} {plusLines === 1 ? 'line' : 'lines'}{' '}
            {numLines > 0 && <CtrlOToExpand />}
          </Text>
        )}
      </Box>
    </MessageResponse>
  )
}

export function userFacingName(
  input: Partial<{ file_path: string; content: string }> | undefined,
): string {
  if (input?.file_path?.startsWith(getPlansDirectory())) {
    return 'Updated plan'
  }
  return 'Write'
}

/** Gates fullscreen click-to-expand. Only `create` truncates (to
 *  MAX_LINES_TO_RENDER); `update` renders the full diff regardless of verbose.
 *  Called per visible message on hover/scroll, so early-exit after finding the
 *  (MAX+1)th line instead of splitting the whole (possibly huge) content. */
export function isResultTruncated({ type, content }: Output): boolean {
  if (type !== 'create') return false
  let pos = 0
  for (let i = 0; i < MAX_LINES_TO_RENDER; i++) {
    pos = content.indexOf(EOL, pos)
    if (pos === -1) return false
    pos++
  }
  // countLines treats a trailing EOL as a terminator, not a new line
  return pos < content.length
}

export function getToolUseSummary(
  input: Partial<{ file_path: string; content: string }> | undefined,
): string | null {
  if (!input?.file_path) {
    return null
  }
  return getDisplayPath(input.file_path)
}

export function renderToolUseMessage(
  input: Partial<{ file_path: string; content: string }>,
  { verbose }: { verbose: boolean },
): React.ReactNode {
  if (!input.file_path) {
    return null
  }
  // For plan files, path is already in userFacingName
  if (input.file_path.startsWith(getPlansDirectory())) {
    return ''
  }
  return (
    <FilePathLink filePath={input.file_path}>
      {verbose ? input.file_path : getDisplayPath(input.file_path)}
    </FilePathLink>
  )
}

export function renderToolUseRejectedMessage(
  { file_path, content }: { file_path: string; content: string },
  { style, verbose }: { style?: 'condensed'; verbose: boolean },
): React.ReactNode {
  return (
    <WriteRejectionDiff
      filePath={file_path}
      content={content}
      style={style}
      verbose={verbose}
    />
  )
}

type RejectionDiffData =
  | { type: 'create' }
  | { type: 'update'; patch: StructuredPatchHunk[]; oldContent: string }
  | { type: 'error' }

function WriteRejectionDiff({
  filePath,
  content,
  style,
  verbose,
}: {
  filePath: string
  content: string
  style?: 'condensed'
  verbose: boolean
}): React.ReactNode {
  const [dataPromise] = useState(() => loadRejectionDiff(filePath, content))
  const firstLine = content.split('\n')[0] ?? null
  const createFallback = (
    <FileEditToolUseRejectedMessage
      file_path={filePath}
      operation="write"
      content={content}
      firstLine={firstLine}
      verbose={verbose}
    />
  )
  return (
    <Suspense fallback={createFallback}>
      <WriteRejectionBody
        promise={dataPromise}
        filePath={filePath}
        firstLine={firstLine}
        createFallback={createFallback}
        style={style}
        verbose={verbose}
      />
    </Suspense>
  )
}

function WriteRejectionBody({
  promise,
  filePath,
  firstLine,
  createFallback,
  style,
  verbose,
}: {
  promise: Promise<RejectionDiffData>
  filePath: string
  firstLine: string | null
  createFallback: React.ReactNode
  style?: 'condensed'
  verbose: boolean
}): React.ReactNode {
  const data = use(promise)
  if (data.type === 'create') return createFallback
  if (data.type === 'error') {
    return (
      <MessageResponse>
        <Text>(No changes)</Text>
      </MessageResponse>
    )
  }
  return (
    <FileEditToolUseRejectedMessage
      file_path={filePath}
      operation="update"
      patch={data.patch}
      firstLine={firstLine}
      fileContent={data.oldContent}
      style={style}
      verbose={verbose}
    />
  )
}

async function loadRejectionDiff(
  filePath: string,
  content: string,
): Promise<RejectionDiffData> {
  try {
    const fullFilePath = isAbsolute(filePath)
      ? filePath
      : resolve(getCwd(), filePath)
    const handle = await openForScan(fullFilePath)
    if (handle === null) return { type: 'create' }
    let oldContent: string | null
    try {
      oldContent = await readCapped(handle)
    } finally {
      await handle.close()
    }
    // File exceeds MAX_SCAN_BYTES — fall back to the create view rather than
    // OOMing on a diff of a multi-GB file.
    if (oldContent === null) return { type: 'create' }
    const patch = getPatchForDisplay({
      filePath,
      fileContents: oldContent,
      edits: [
        { old_string: oldContent, new_string: content, replace_all: false },
      ],
    })
    return { type: 'update', patch, oldContent }
  } catch (e) {
    // User may have manually applied the change while the diff was shown.
    logError(e as Error)
    return { type: 'error' }
  }
}

export function renderToolUseErrorMessage(
  result: ToolResultBlockParam['content'],
  { verbose }: { verbose: boolean },
): React.ReactNode {
  if (
    !verbose &&
    typeof result === 'string' &&
    extractTag(result, 'tool_use_error')
  ) {
    return (
      <MessageResponse>
        <Text color="error">Error writing file</Text>
      </MessageResponse>
    )
  }
  return <FallbackToolUseErrorMessage result={result} verbose={verbose} />
}

export function renderToolResultMessage(
  { filePath, content, structuredPatch, type, originalFile }: Output,
  _progressMessagesForMessage: ProgressMessage<ToolProgressData>[],
  { style, verbose }: { style?: 'condensed'; verbose: boolean },
): React.ReactNode {
  switch (type) {
    case 'create': {
      const isPlanFile = filePath.startsWith(getPlansDirectory())

      // Plan files: invert condensed behavior
      // - Regular mode: just show hint (user can type /plan to see full content)
      // - Condensed mode (subagent view): show full content
      if (isPlanFile && !verbose) {
        if (style !== 'condensed') {
          return (
            <MessageResponse>
              <Text dimColor>/plan to preview</Text>
            </MessageResponse>
          )
        }
      } else if (style === 'condensed' && !verbose) {
        const numLines = countLines(content)
        return (
          <Text>
            Wrote <Text bold>{numLines}</Text> lines to{' '}
            <Text bold>{relative(getCwd(), filePath)}</Text>
          </Text>
        )
      }

      return (
        <FileWriteToolCreatedMessage
          filePath={filePath}
          content={content}
          verbose={verbose}
        />
      )
    }
    case 'update': {
      const isPlanFile = filePath.startsWith(getPlansDirectory())
      return (
        <FileEditToolUpdatedMessage
          filePath={filePath}
          structuredPatch={structuredPatch}
          firstLine={content.split('\n')[0] ?? null}
          fileContent={originalFile ?? undefined}
          style={style}
          verbose={verbose}
          previewHint={isPlanFile ? '/plan to preview' : undefined}
        />
      )
    }
  }
}
