import figures from 'figures'
import * as React from 'react'
import { Box, Text, type TextProps } from '../../ink.js'
import { useAppState } from '../../state/AppState.js'
import { getRunningTeammatesSorted } from '../../tasks/InProcessTeammateTask/InProcessTeammateTask.js'
import { formatNumber } from '../../utils/format.js'
import { TeammateSpinnerLine } from './TeammateSpinnerLine.js'
import { TEAMMATE_SELECT_HINT } from './teammateSelectHint.js'

type Props = {
  selectedIndex?: number
  isInSelectionMode?: boolean
  allIdle?: boolean
  /** Leader's active verb (when leader is actively processing) */
  leaderVerb?: string
  /** Leader's token count (when leader is actively processing) */
  leaderTokenCount?: number
  /** Leader's idle status text (when leader is idle, e.g. "✻ Idle for 3s") */
  leaderIdleText?: string
}

export function TeammateSpinnerTree({
  selectedIndex,
  isInSelectionMode,
  allIdle,
  leaderVerb,
  leaderTokenCount,
  leaderIdleText,
}: Props): React.ReactNode {
  const tasks = useAppState(s => s.tasks)
  const viewingAgentTaskId = useAppState(s => s.viewingAgentTaskId)
  const showTeammateMessagePreview = useAppState(
    s => s.showTeammateMessagePreview,
  )

  const teammateTasks = getRunningTeammatesSorted(tasks)

  // Don't render if no running teammates
  if (teammateTasks.length === 0) {
    return null
  }

  // Leader highlighting follows same pattern as teammates:
  // isHighlighted = isForegrounded || isSelected
  const isLeaderForegrounded = viewingAgentTaskId === undefined
  const isLeaderSelected = isInSelectionMode && selectedIndex === -1
  const isLeaderHighlighted = isLeaderForegrounded || isLeaderSelected
  const leaderColor: TextProps['color'] = 'cyan_FOR_SUBAGENTS_ONLY'

  // Is the "hide" row selected? (index === teammateCount in selection mode)
  const isHideSelected =
    isInSelectionMode === true && selectedIndex === teammateTasks.length

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Leader row - always visible, uses ┌─ to enclose the tree */}
      {
        <Box paddingLeft={3}>
          <Text
            color={isLeaderSelected ? 'suggestion' : undefined}
            bold={isLeaderHighlighted}
          >
            {isLeaderSelected ? figures.pointer : ' '}
          </Text>
          <Text dimColor={!isLeaderHighlighted} bold={isLeaderHighlighted}>
            {isLeaderHighlighted ? '╒═' : '┌─'}{' '}
          </Text>
          <Text
            bold={isLeaderHighlighted}
            color={isLeaderSelected ? 'suggestion' : leaderColor}
          >
            team-lead
          </Text>
          {/* When backgrounded and active: show spinner + verb */}
          {!isLeaderForegrounded && leaderVerb && (
            <Text dimColor>: {leaderVerb}…</Text>
          )}
          {/* When backgrounded and idle: show idle text */}
          {!isLeaderForegrounded && !leaderVerb && leaderIdleText && (
            <Text dimColor>: {leaderIdleText}</Text>
          )}
          {/* Stats (tokens) - same dimColor logic as teammates */}
          {leaderTokenCount !== undefined && leaderTokenCount > 0 && (
            <Text dimColor={!isLeaderHighlighted}>
              {' '}
              · {formatNumber(leaderTokenCount)} tokens
            </Text>
          )}
          {/* Hints - select hint when highlighted, view hint when selected but not foregrounded */}
          {isLeaderHighlighted && (
            <Text dimColor> · {TEAMMATE_SELECT_HINT}</Text>
          )}
          {isLeaderSelected && !isLeaderForegrounded && (
            <Text dimColor> · enter to view</Text>
          )}
        </Box>
      }
      {teammateTasks.map((teammate, index) => (
        <TeammateSpinnerLine
          key={teammate.id}
          teammate={teammate}
          isLast={!isInSelectionMode && index === teammateTasks.length - 1}
          isSelected={isInSelectionMode && selectedIndex === index}
          isForegrounded={viewingAgentTaskId === teammate.id}
          allIdle={allIdle}
          showPreview={showTeammateMessagePreview}
        />
      ))}
      {/* Hide row - only visible during selection mode */}
      {isInSelectionMode && <HideRow isSelected={isHideSelected} />}
    </Box>
  )
}

function HideRow({ isSelected }: { isSelected: boolean }): React.ReactNode {
  return (
    <Box paddingLeft={3}>
      <Text color={isSelected ? 'suggestion' : undefined} bold={isSelected}>
        {isSelected ? figures.pointer : ' '}
      </Text>
      <Text dimColor={!isSelected} bold={isSelected}>
        {isSelected ? '╘═' : '└─'}{' '}
      </Text>
      <Text dimColor={!isSelected} bold={isSelected}>
        hide
      </Text>
      {isSelected && <Text dimColor> · enter to collapse</Text>}
    </Box>
  )
}
