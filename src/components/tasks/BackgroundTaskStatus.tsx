import figures from 'figures'
import * as React from 'react'
import { useMemo, useState } from 'react'
import { useTerminalSize } from 'src/hooks/useTerminalSize.js'
import { stringWidth } from '@anthropic/ink'
import { useAppState, useSetAppState } from 'src/state/AppState.js'
import {
  enterTeammateView,
  exitTeammateView,
} from 'src/state/teammateViewHelpers.js'
import { isPanelAgentTask } from 'src/tasks/LocalAgentTask/LocalAgentTask.js'
import { getPillLabel, pillNeedsCta } from 'src/tasks/pillLabel.js'
import {
  type BackgroundTaskState,
  isBackgroundTask,
  type TaskState,
} from 'src/tasks/types.js'
import { calculateHorizontalScrollWindow } from 'src/utils/horizontalScroll.js'
import { Box, Text } from '@anthropic/ink'
import {
  AGENT_COLOR_TO_THEME_COLOR,
  AGENT_COLORS,
  type AgentColorName,
} from '../../tools/AgentTool/agentColorManager.js'
import type { Theme } from '../../utils/theme.js'
import { KeyboardShortcutHint } from '@anthropic/ink'
import { shouldHideTasksFooter } from './taskStatusUtils.js'

type Props = {
  tasksSelected: boolean
  isViewingTeammate?: boolean
  teammateFooterIndex?: number
  isLeaderIdle?: boolean
  onOpenDialog?: (taskId?: string) => void
}

export function BackgroundTaskStatus({
  tasksSelected,
  isViewingTeammate,
  teammateFooterIndex = 0,
  isLeaderIdle = false,
  onOpenDialog,
}: Props): React.ReactNode {
  const setAppState = useSetAppState()
  const { columns } = useTerminalSize()
  const tasks = useAppState(s => s.tasks)
  const viewingAgentTaskId = useAppState(s => s.viewingAgentTaskId)

  const runningTasks = useMemo(
    () =>
      (Object.values(tasks ?? {}) as TaskState[]).filter(
        t =>
          isBackgroundTask(t) &&
          !(process.env.USER_TYPE === 'ant' && isPanelAgentTask(t)),
      ),
    [tasks],
  )

  // Check if all tasks are in-process teammates (team mode)
  // In spinner-tree mode, don't show teammate pills (teammates appear in the spinner tree)
  const expandedView = useAppState(s => s.expandedView)
  const showSpinnerTree = expandedView === 'teammates'
  const allTeammates =
    !showSpinnerTree &&
    runningTasks.length > 0 &&
    runningTasks.every(t => t.type === 'in_process_teammate')

  // Memoize teammate-related computations at the top level (rules of hooks)
  const teammateEntries = useMemo(
    () =>
      runningTasks
        .filter(
          (t): t is BackgroundTaskState & { type: 'in_process_teammate' } =>
            t.type === 'in_process_teammate',
        )
        .sort((a, b) =>
          a.identity.agentName.localeCompare(b.identity.agentName),
        ),
    [runningTasks],
  )

  // Build array of all pills with their activity state
  // Each pill is "@{name}" and separator is " " (1 char)
  // Sort idle agents to the end, but only when not in selection mode
  // to avoid reordering while user is arrowing through the list
  // "main" always stays first regardless of idle state
  const allPills = useMemo(() => {
    const mainPill = {
      name: 'main',
      color: undefined as keyof Theme | undefined,
      isIdle: isLeaderIdle,
      taskId: undefined as string | undefined,
    }

    const teammatePills = teammateEntries.map(t => ({
      name: t.identity.agentName,
      color: getAgentThemeColor(t.identity.color),
      isIdle: t.isIdle,
      taskId: t.id,
    }))

    // Only sort teammates when not selecting to avoid reordering during navigation
    if (!tasksSelected) {
      teammatePills.sort((a, b) => {
        // Active agents first, idle agents last
        if (a.isIdle !== b.isIdle) return a.isIdle ? 1 : -1
        return 0 // Keep original order within each group
      })
    }

    // main always first, then sorted teammates
    const pills = [mainPill, ...teammatePills]

    // Add idx after sorting
    return pills.map((pill, i) => ({ ...pill, idx: i }))
  }, [teammateEntries, isLeaderIdle, tasksSelected])

  // Calculate pill widths (including separator space, except first)
  const pillWidths = useMemo(
    () =>
      allPills.map((pill, i) => {
        const pillText = `@${pill.name}`
        // First pill has no leading space, others have 1 space separator
        return stringWidth(pillText) + (i > 0 ? 1 : 0)
      }),
    [allPills],
  )

  if (allTeammates || (!showSpinnerTree && isViewingTeammate)) {
    const selectedIdx = tasksSelected ? teammateFooterIndex : -1
    // Which agent is currently foregrounded (bold)
    const viewedIdx = viewingAgentTaskId
      ? teammateEntries.findIndex(t => t.id === viewingAgentTaskId) + 1
      : 0 // 0 = main/leader

    // Calculate available width for pills
    // Reserve space for: arrows, hint, and minimal padding
    // Pills are rendered on their own line when in team mode
    const ARROW_WIDTH = 2 // arrow char + space
    const HINT_WIDTH = 20 // shift+↓ to expand
    const PADDING = 4 // minimal safety margin
    const availableWidth = Math.max(20, columns - HINT_WIDTH - PADDING)

    // Calculate visible window of pills
    const { startIndex, endIndex, showLeftArrow, showRightArrow } =
      calculateHorizontalScrollWindow(
        pillWidths,
        availableWidth,
        ARROW_WIDTH,
        selectedIdx >= 0 ? selectedIdx : 0,
      )

    const visiblePills = allPills.slice(startIndex, endIndex)

    return (
      <>
        {showLeftArrow && <Text dimColor>{figures.arrowLeft} </Text>}
        {visiblePills.map((pill, i) => {
          // First visible pill has no leading separator
          // (left arrow already provides spacing if present)
          const needsSeparator = i > 0
          return (
            <React.Fragment key={pill.name}>
              {needsSeparator && <Text> </Text>}
              <AgentPill
                name={pill.name}
                color={pill.color}
                isSelected={selectedIdx === pill.idx}
                isViewed={viewedIdx === pill.idx}
                isIdle={pill.isIdle}
                onClick={() =>
                  pill.taskId
                    ? enterTeammateView(pill.taskId, setAppState)
                    : exitTeammateView(setAppState)
                }
              />
            </React.Fragment>
          )
        })}
        {showRightArrow && <Text dimColor> {figures.arrowRight}</Text>}
        <Text dimColor>
          {' · '}
          <KeyboardShortcutHint shortcut="shift + ↓" action="expand" />
        </Text>
      </>
    )
  }

  // In spinner-tree mode, don't show any footer status for teammates
  // (they appear in the spinner tree above)
  if (shouldHideTasksFooter(tasks ?? {}, showSpinnerTree)) {
    return null
  }

  if (runningTasks.length === 0) {
    return null
  }

  return (
    <>
      <SummaryPill selected={tasksSelected} onClick={onOpenDialog}>
        {getPillLabel(runningTasks)}
      </SummaryPill>
      {pillNeedsCta(runningTasks) && (
        <Text dimColor> · {figures.arrowDown} to view</Text>
      )}
    </>
  )
}

type AgentPillProps = {
  name: string
  color?: keyof Theme
  isSelected: boolean
  isViewed: boolean
  isIdle: boolean
  onClick?: () => void
}

function AgentPill({
  name,
  color,
  isSelected,
  isViewed,
  isIdle,
  onClick,
}: AgentPillProps): React.ReactNode {
  const [hover, setHover] = useState(false)
  // Hover mirrors the keyboard-selected look so the affordance is familiar.
  const highlighted = isSelected || hover

  let label: React.ReactNode
  if (highlighted) {
    label = color ? (
      <Text backgroundColor={color} color="inverseText" bold={isViewed}>
        @{name}
      </Text>
    ) : (
      <Text color="background" inverse bold={isViewed}>
        @{name}
      </Text>
    )
  } else if (isIdle) {
    label = (
      <Text dimColor bold={isViewed}>
        @{name}
      </Text>
    )
  } else if (isViewed) {
    label = (
      <Text color={color} bold>
        @{name}
      </Text>
    )
  } else {
    label = (
      <Text color={color} dimColor={!color}>
        @{name}
      </Text>
    )
  }

  if (!onClick) return label
  return (
    <Box
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {label}
    </Box>
  )
}

function SummaryPill({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick?: () => void
  children: React.ReactNode
}): React.ReactNode {
  const [hover, setHover] = useState(false)
  const label = (
    <Text color="background" inverse={selected || hover}>
      {children}
    </Text>
  )
  if (!onClick) return label
  return (
    <Box
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {label}
    </Box>
  )
}

function getAgentThemeColor(
  colorName: string | undefined,
): keyof Theme | undefined {
  if (!colorName) return undefined
  if (AGENT_COLORS.includes(colorName as AgentColorName)) {
    return AGENT_COLOR_TO_THEME_COLOR[colorName as AgentColorName]
  }
  return undefined
}
