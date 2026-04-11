import React, { useCallback } from 'react'
import type { DeepImmutable } from 'src/types/utils.js'
import { useElapsedTime } from '../../hooks/useElapsedTime.js'
import { Box, Text, type KeyboardEvent } from '@anthropic/ink'
import { useKeybindings } from '../../keybindings/useKeybinding.js'
import type { LocalWorkflowTaskState } from '../../tasks/LocalWorkflowTask/LocalWorkflowTask.js'
import { Byline } from '../design-system/Byline.js'
import { Dialog } from '../design-system/Dialog.js'
import { KeyboardShortcutHint } from '../design-system/KeyboardShortcutHint.js'

type Props = {
  workflow: DeepImmutable<LocalWorkflowTaskState>
  onDone: (message?: string, options?: { display?: string }) => void
  onKill?: () => void
  onSkipAgent?: (agentId: string) => void
  onRetryAgent?: (agentId: string) => void
  onBack?: () => void
}

/**
 * Detail dialog for local workflow tasks shown in the Shift+Down background
 * tasks overlay. Displays the workflow name, file, status, and output.
 * Follows the DreamDetailDialog/ShellDetailDialog pattern.
 */
export function WorkflowDetailDialog({
  workflow,
  onDone,
  onKill,
  onSkipAgent: _onSkipAgent,
  onRetryAgent: _onRetryAgent,
  onBack,
}: Props): React.ReactNode {
  const elapsedTime = useElapsedTime(
    workflow.startTime,
    workflow.status === 'running',
    1000,
    0,
  )

  useKeybindings(
    {},
    { context: 'WorkflowDetail' },
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent): void => {
      if (e.key === 'left' && onBack) {
        e.preventDefault()
        onBack()
      } else if (e.key === 'x' && workflow.status === 'running' && onKill) {
        e.preventDefault()
        onKill()
      }
    },
    [onBack, onKill, workflow.status],
  )

  return (
    <Box flexDirection="column" tabIndex={0} borderStyle="round" onKeyDown={handleKeyDown}>
      <Dialog
        title="Workflow"
        subtitle={
          <Text dimColor>
            {elapsedTime} · {workflow.workflowName}
          </Text>
        }
        onCancel={onBack ?? (() => {})}
        inputGuide={() => (
          <Byline>
            {onBack && (
              <KeyboardShortcutHint shortcut={'\u2190'} action="go back" />
            )}
            <KeyboardShortcutHint shortcut="Esc" action="close" />
            {workflow.status === 'running' && onKill && (
              <KeyboardShortcutHint shortcut="x" action="stop" />
            )}
          </Byline>
        )}
      >
        <Box flexDirection="column" gap={1}>
          <Text>
            <Text bold>Status:</Text>{' '}
            {workflow.status === 'running' ? (
              <Text color="ansi:green">running</Text>
            ) : workflow.status === 'completed' ? (
              <Text color="ansi:green">{workflow.status}</Text>
            ) : (
              <Text color="ansi:red">{workflow.status}</Text>
            )}
          </Text>
          <Text>
            <Text bold>Description:</Text> {workflow.description}
          </Text>
          <Text>
            <Text bold>Workflow:</Text> {workflow.workflowName}
          </Text>
          <Text>
            <Text bold>File:</Text> {workflow.workflowFile}
          </Text>
          {workflow.summary && (
            <Text>
              <Text bold>Summary:</Text> {workflow.summary}
            </Text>
          )}
          {workflow.output && (
            <Box flexDirection="column">
              <Text bold>Output:</Text>
              <Text dimColor>{workflow.output}</Text>
            </Box>
          )}
        </Box>
      </Dialog>
    </Box>
  )
}
