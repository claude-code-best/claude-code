import React from 'react'
import { Box } from '@anthropic/ink'
import { BashTool } from '@claude-code-best/builtin-tools/tools/BashTool/BashTool.js'
import type { ShellProgress } from '../types/tools.js'
import { UserBashInputMessage } from './messages/UserBashInputMessage.js'
import { ShellProgressMessage } from './shell/ShellProgressMessage.js'

type Props = {
  input: string
  progress: ShellProgress | null
  verbose: boolean
}

export function BashModeProgress({
  input,
  progress,
  verbose,
}: Props): React.ReactNode {
  return (
    <Box flexDirection="column" marginTop={1}>
      <UserBashInputMessage
        addMargin={false}
        param={{ text: `<bash-input>${input}</bash-input>`, type: 'text' }}
      />
      {progress ? (
        <ShellProgressMessage
          fullOutput={progress.fullOutput}
          output={progress.output}
          elapsedTimeSeconds={progress.elapsedTimeSeconds}
          totalLines={progress.totalLines}
          verbose={verbose}
        />
      ) : (
        BashTool.renderToolUseProgressMessage?.([], {
          verbose,
          tools: [],
          terminalSize: undefined,
        })
      )}
    </Box>
  )
}
