import React from 'react'
import { removeSandboxViolationTags } from 'src/utils/sandbox/sandbox-ui-utils.js'
import { KeyboardShortcutHint } from '../../components/design-system/KeyboardShortcutHint.js'
import { MessageResponse } from '../../components/MessageResponse.js'
import { OutputLine } from '../../components/shell/OutputLine.js'
import { ShellTimeDisplay } from '../../components/shell/ShellTimeDisplay.js'
import { Box, Text } from '../../ink.js'
import type { Out as BashOut } from './BashTool.js'

type Props = {
  content: Omit<BashOut, 'interrupted'>
  verbose: boolean
  timeoutMs?: number
}

// Pattern to match "Shell cwd was reset to <path>" message
// Use (?:^|\n) to match either start of string or after a newline
const SHELL_CWD_RESET_PATTERN = /(?:^|\n)(Shell cwd was reset to .+)$/

/**
 * Extracts sandbox violations from stderr if present
 * Returns both the cleaned stderr and the violations content
 */
function extractSandboxViolations(stderr: string): {
  cleanedStderr: string
} {
  const violationsMatch = stderr.match(
    /<sandbox_violations>([\s\S]*?)<\/sandbox_violations>/,
  )

  if (!violationsMatch) {
    return { cleanedStderr: stderr }
  }

  // Remove the sandbox violations section from stderr
  const cleanedStderr = removeSandboxViolationTags(stderr).trim()

  return {
    cleanedStderr,
  }
}

/**
 * Extracts the "Shell cwd was reset" warning message from stderr
 * Returns the cleaned stderr and the warning message separately
 */
function extractCwdResetWarning(stderr: string): {
  cleanedStderr: string
  cwdResetWarning: string | null
} {
  const match = stderr.match(SHELL_CWD_RESET_PATTERN)
  if (!match) {
    return { cleanedStderr: stderr, cwdResetWarning: null }
  }

  // Extract the warning message from capture group 1
  const cwdResetWarning = match[1] ?? null
  // Remove the warning from stderr (replace the full match)
  const cleanedStderr = stderr.replace(SHELL_CWD_RESET_PATTERN, '').trim()

  return { cleanedStderr, cwdResetWarning }
}

export default function BashToolResultMessage({
  content: {
    stdout = '',
    stderr: stdErrWithViolations = '',
    isImage,
    returnCodeInterpretation,
    noOutputExpected,
    backgroundTaskId,
  },
  verbose,
  timeoutMs,
}: Props): React.ReactNode {
  // Extract sandbox violations from stderr as it feels cleaner on the UI
  // We want the model to see the violations, so it can explain what went wrong, and the
  // user can access them in the violation logs
  const { cleanedStderr: stderrWithoutViolations } =
    extractSandboxViolations(stdErrWithViolations)

  // Extract "Shell cwd was reset" warning to render it with warning color instead of error
  const { cleanedStderr: stderr, cwdResetWarning } = extractCwdResetWarning(
    stderrWithoutViolations,
  )

  // If this is an image, we don't want to truncate it in the UI
  if (isImage) {
    return (
      <MessageResponse height={1}>
        <Text dimColor>[Image data detected and sent to Claude]</Text>
      </MessageResponse>
    )
  }

  return (
    <Box flexDirection="column">
      {stdout !== '' ? <OutputLine content={stdout} verbose={verbose} /> : null}
      {stderr.trim() !== '' ? (
        <OutputLine content={stderr} verbose={verbose} isError />
      ) : null}
      {cwdResetWarning ? (
        <MessageResponse>
          <Text dimColor>{cwdResetWarning}</Text>
        </MessageResponse>
      ) : null}
      {stdout === '' && stderr.trim() === '' && !cwdResetWarning ? (
        <MessageResponse height={1}>
          <Text dimColor>
            {backgroundTaskId ? (
              <>
                Running in the background{' '}
                <KeyboardShortcutHint shortcut="↓" action="manage" parens />
              </>
            ) : (
              returnCodeInterpretation ||
              (noOutputExpected ? 'Done' : '(No output)')
            )}
          </Text>
        </MessageResponse>
      ) : null}
      {timeoutMs && (
        <MessageResponse>
          <ShellTimeDisplay timeoutMs={timeoutMs} />
        </MessageResponse>
      )}
    </Box>
  )
}
