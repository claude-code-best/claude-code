import React from 'react'
import stripAnsi from 'strip-ansi'
import { Box, Text } from '../../ink.js'
import { formatFileSize } from '../../utils/format.js'
import { MessageResponse } from '../MessageResponse.js'
import { OffscreenFreeze } from '../OffscreenFreeze.js'
import { ShellTimeDisplay } from './ShellTimeDisplay.js'

type Props = {
  output: string
  fullOutput: string
  elapsedTimeSeconds?: number
  totalLines?: number
  totalBytes?: number
  timeoutMs?: number
  taskId?: string
  verbose: boolean
}

export function ShellProgressMessage({
  output,
  fullOutput,
  elapsedTimeSeconds,
  totalLines,
  totalBytes,
  timeoutMs,
  verbose,
}: Props): React.ReactNode {
  const strippedFullOutput = stripAnsi(fullOutput.trim())
  const strippedOutput = stripAnsi(output.trim())
  const lines = strippedOutput.split('\n').filter(line => line)
  const displayLines = verbose ? strippedFullOutput : lines.slice(-5).join('\n')

  // OffscreenFreeze: BashTool yields progress (elapsedTimeSeconds) every second.
  // If this line scrolls into scrollback, each tick forces a full terminal reset.
  // A foreground `sleep 600` on a 29-row terminal with 4000 rows of history
  // produced 507 resets over 10 minutes (go/ccshare/maxk-20260226-190348).
  if (!lines.length) {
    return (
      <MessageResponse>
        <OffscreenFreeze>
          <Text dimColor>Running… </Text>
          <ShellTimeDisplay
            elapsedTimeSeconds={elapsedTimeSeconds}
            timeoutMs={timeoutMs}
          />
        </OffscreenFreeze>
      </MessageResponse>
    )
  }

  // Not truncated: "+2 lines" (total exceeds displayed 5)
  // Truncated:     "~2000 lines" (extrapolated estimate from tail sample)
  const extraLines = totalLines ? Math.max(0, totalLines - 5) : 0
  let lineStatus = ''
  if (!verbose && totalBytes && totalLines) {
    lineStatus = `~${totalLines} lines`
  } else if (!verbose && extraLines > 0) {
    lineStatus = `+${extraLines} lines`
  }

  return (
    <MessageResponse>
      <OffscreenFreeze>
        <Box flexDirection="column">
          <Box
            height={verbose ? undefined : Math.min(5, lines.length)}
            flexDirection="column"
            overflow="hidden"
          >
            <Text dimColor>{displayLines}</Text>
          </Box>
          <Box flexDirection="row" gap={1}>
            {lineStatus ? <Text dimColor>{lineStatus}</Text> : null}
            <ShellTimeDisplay
              elapsedTimeSeconds={elapsedTimeSeconds}
              timeoutMs={timeoutMs}
            />
            {totalBytes ? (
              <Text dimColor>{formatFileSize(totalBytes)}</Text>
            ) : null}
          </Box>
        </Box>
      </OffscreenFreeze>
    </MessageResponse>
  )
}
