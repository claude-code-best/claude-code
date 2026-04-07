import { relative } from 'path'
import React from 'react'
import { Box, Text } from '../ink.js'
import { DiagnosticTrackingService } from '../services/diagnosticTracking.js'
import type { Attachment } from '../utils/attachments.js'
import { getCwd } from '../utils/cwd.js'
import { CtrlOToExpand } from './CtrlOToExpand.js'
import { MessageResponse } from './MessageResponse.js'

type DiagnosticsAttachment = Extract<Attachment, { type: 'diagnostics' }>

type DiagnosticsDisplayProps = {
  attachment: DiagnosticsAttachment
  verbose: boolean
}

export function DiagnosticsDisplay({
  attachment,
  verbose,
}: DiagnosticsDisplayProps): React.ReactNode {
  // Only show if there are diagnostics to report
  if (attachment.files.length === 0) return null

  // Count total issues
  const totalIssues = attachment.files.reduce(
    (sum, file) => sum + file.diagnostics.length,
    0,
  )

  const fileCount = attachment.files.length

  if (verbose) {
    // Show all diagnostics in verbose mode (ctrl+o)
    return (
      <Box flexDirection="column">
        {attachment.files.map((file, fileIndex) => (
          <React.Fragment key={fileIndex}>
            <MessageResponse>
              <Text dimColor wrap="wrap">
                <Text bold>
                  {relative(
                    getCwd(),
                    file.uri
                      .replace('file://', '')
                      .replace('_claude_fs_right:', ''),
                  )}
                </Text>{' '}
                <Text dimColor>
                  {file.uri.startsWith('file://')
                    ? '(file://)'
                    : file.uri.startsWith('_claude_fs_right:')
                      ? '(claude_fs_right)'
                      : `(${file.uri.split(':')[0]})`}
                </Text>
                :
              </Text>
            </MessageResponse>
            {file.diagnostics.map((diagnostic, diagIndex) => (
              <MessageResponse key={diagIndex}>
                <Text dimColor wrap="wrap">
                  {'  '}
                  {DiagnosticTrackingService.getSeveritySymbol(
                    diagnostic.severity,
                  )}
                  {' [Line '}
                  {diagnostic.range.start.line + 1}:
                  {diagnostic.range.start.character + 1}
                  {'] '}
                  {diagnostic.message}
                  {diagnostic.code ? ` [${diagnostic.code}]` : ''}
                  {diagnostic.source ? ` (${diagnostic.source})` : ''}
                </Text>
              </MessageResponse>
            ))}
          </React.Fragment>
        ))}
      </Box>
    )
  } else {
    // Show summary in normal mode
    return (
      <MessageResponse>
        <Text dimColor wrap="wrap">
          Found <Text bold>{totalIssues}</Text> new diagnostic{' '}
          {totalIssues === 1 ? 'issue' : 'issues'} in {fileCount}{' '}
          {fileCount === 1 ? 'file' : 'files'} <CtrlOToExpand />
        </Text>
      </MessageResponse>
    )
  }
}
