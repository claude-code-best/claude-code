import * as React from 'react'
import { Box, Text } from '@anthropic/ink'
import {
  isTaskAssignment,
  type TaskAssignmentMessage,
} from '../../utils/teammateMailbox.js'

type Props = {
  assignment: TaskAssignmentMessage
}

/**
 * Renders a task assignment with a cyan border (team-related color).
 */
export function TaskAssignmentDisplay({ assignment }: Props): React.ReactNode {
  return (
    <Box flexDirection="column" marginY={1}>
      <Box
        borderStyle="round"
        borderColor="cyan_FOR_SUBAGENTS_ONLY"
        flexDirection="column"
        paddingX={1}
        paddingY={1}
      >
        <Box marginBottom={1}>
          <Text color="cyan_FOR_SUBAGENTS_ONLY" bold>
            Task #{assignment.taskId} assigned by {assignment.assignedBy}
          </Text>
        </Box>
        <Box>
          <Text bold>{assignment.subject}</Text>
        </Box>
        {assignment.description && (
          <Box marginTop={1}>
            <Text dimColor>{assignment.description}</Text>
          </Box>
        )}
      </Box>
    </Box>
  )
}

/**
 * Try to parse and render a task assignment message from raw content.
 */
export function tryRenderTaskAssignmentMessage(
  content: string,
): React.ReactNode | null {
  const assignment = isTaskAssignment(content)
  if (assignment) {
    return <TaskAssignmentDisplay assignment={assignment} />
  }
  return null
}

/**
 * Get a brief summary text for a task assignment message.
 */
export function getTaskAssignmentSummary(content: string): string | null {
  const assignment = isTaskAssignment(content)
  if (assignment) {
    return `[Task Assigned] #${assignment.taskId} - ${assignment.subject}`
  }
  return null
}
