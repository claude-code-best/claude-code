import figures from 'figures'
import * as React from 'react'
import { useTerminalSize } from '../hooks/useTerminalSize.js'
import { Box, Text, stringWidth } from '@anthropic/ink'
import { useAppState } from '../state/AppState.js'
import { isInProcessTeammateTask } from '../tasks/InProcessTeammateTask/types.js'
import {
  AGENT_COLOR_TO_THEME_COLOR,
  type AgentColorName,
} from '../tools/AgentTool/agentColorManager.js'
import { isAgentSwarmsEnabled } from '../utils/agentSwarmsEnabled.js'
import { count } from '../utils/array.js'
import { summarizeRecentActivities } from '../utils/collapseReadSearch.js'
import { truncateToWidth } from '../utils/format.js'
import { isTodoV2Enabled, type Task } from '../utils/tasks.js'
import type { Theme } from '../utils/theme.js'
import ThemedText from './design-system/ThemedText.js'

type Props = {
  tasks: Task[]
  isStandalone?: boolean
}

const RECENT_COMPLETED_TTL_MS = 30_000

function byIdAsc(a: Task, b: Task): number {
  const aNum = parseInt(a.id, 10)
  const bNum = parseInt(b.id, 10)
  if (!isNaN(aNum) && !isNaN(bNum)) {
    return aNum - bNum
  }
  return a.id.localeCompare(b.id)
}

export function TaskListV2({
  tasks,
  isStandalone = false,
}: Props): React.ReactNode {
  const teamContext = useAppState(s => s.teamContext)
  const appStateTasks = useAppState(s => s.tasks)
  const [, forceUpdate] = React.useState(0)
  const { rows, columns } = useTerminalSize()

  // Track when each task was last observed transitioning to completed
  const completionTimestampsRef = React.useRef(new Map<string, number>())
  const previousCompletedIdsRef = React.useRef<Set<string> | null>(null)
  if (previousCompletedIdsRef.current === null) {
    previousCompletedIdsRef.current = new Set(
      tasks.filter(t => t.status === 'completed').map(t => t.id),
    )
  }
  const maxDisplay = rows <= 10 ? 0 : Math.min(10, Math.max(3, rows - 14))

  // Update completion timestamps: reset when a task transitions to completed
  const currentCompletedIds = new Set(
    tasks.filter(t => t.status === 'completed').map(t => t.id),
  )
  const now = Date.now()
  for (const id of currentCompletedIds) {
    if (!previousCompletedIdsRef.current.has(id)) {
      completionTimestampsRef.current.set(id, now)
    }
  }
  for (const id of completionTimestampsRef.current.keys()) {
    if (!currentCompletedIds.has(id)) {
      completionTimestampsRef.current.delete(id)
    }
  }
  previousCompletedIdsRef.current = currentCompletedIds

  // Schedule re-render when the next recent completion expires.
  // Depend on `tasks` so the timer is only reset when the task list changes,
  // not on every render (which was causing unnecessary work).
  React.useEffect(() => {
    if (completionTimestampsRef.current.size === 0) {
      return
    }
    const currentNow = Date.now()
    let earliestExpiry = Infinity
    for (const ts of completionTimestampsRef.current.values()) {
      const expiry = ts + RECENT_COMPLETED_TTL_MS
      if (expiry > currentNow && expiry < earliestExpiry) {
        earliestExpiry = expiry
      }
    }
    if (earliestExpiry === Infinity) {
      return
    }
    const timer = setTimeout(
      forceUpdate => forceUpdate((n: number) => n + 1),
      earliestExpiry - currentNow,
      forceUpdate,
    )
    return () => clearTimeout(timer)
  }, [tasks])

  if (!isTodoV2Enabled()) {
    return null
  }

  if (tasks.length === 0) {
    return null
  }

  // Build a map of teammate name -> theme color
  const teammateColors: Record<string, keyof Theme> = {}
  if (isAgentSwarmsEnabled() && teamContext?.teammates) {
    for (const teammate of Object.values(teamContext.teammates)) {
      if (teammate.color) {
        const themeColor =
          AGENT_COLOR_TO_THEME_COLOR[teammate.color as AgentColorName]
        if (themeColor) {
          teammateColors[teammate.name] = themeColor
        }
      }
    }
  }

  // Build a map of teammate name -> current activity description
  // Map both agentName ("researcher") and agentId ("researcher@team") so
  // task owners match regardless of which format the model used.
  // Rolls up consecutive search/read tool uses into a compact summary.
  // Also track which teammates are still running (not shut down).
  const teammateActivity: Record<string, string> = {}
  const activeTeammates = new Set<string>()
  if (isAgentSwarmsEnabled()) {
    for (const bgTask of Object.values(appStateTasks)) {
      if (isInProcessTeammateTask(bgTask) && bgTask.status === 'running') {
        activeTeammates.add(bgTask.identity.agentName)
        activeTeammates.add(bgTask.identity.agentId)
        const activities = bgTask.progress?.recentActivities
        const desc =
          (activities && summarizeRecentActivities(activities)) ??
          bgTask.progress?.lastActivity?.activityDescription
        if (desc) {
          teammateActivity[bgTask.identity.agentName] = desc
          teammateActivity[bgTask.identity.agentId] = desc
        }
      }
    }
  }

  // Get task counts for display
  const completedCount = count(tasks, t => t.status === 'completed')
  const pendingCount = count(tasks, t => t.status === 'pending')
  const inProgressCount = tasks.length - completedCount - pendingCount
  // Unresolved tasks (open or in_progress) block dependent tasks
  const unresolvedTaskIds = new Set(
    tasks.filter(t => t.status !== 'completed').map(t => t.id),
  )

  // Check if we need to truncate
  const needsTruncation = tasks.length > maxDisplay

  let visibleTasks: Task[]
  let hiddenTasks: Task[]

  if (needsTruncation) {
    // Prioritize: recently completed (within 30s), in-progress, pending, older completed
    const recentCompleted: Task[] = []
    const olderCompleted: Task[] = []
    for (const task of tasks.filter(t => t.status === 'completed')) {
      const ts = completionTimestampsRef.current.get(task.id)
      if (ts && now - ts < RECENT_COMPLETED_TTL_MS) {
        recentCompleted.push(task)
      } else {
        olderCompleted.push(task)
      }
    }
    recentCompleted.sort(byIdAsc)
    olderCompleted.sort(byIdAsc)
    const inProgress = tasks
      .filter(t => t.status === 'in_progress')
      .sort(byIdAsc)
    const pending = tasks
      .filter(t => t.status === 'pending')
      .sort((a, b) => {
        const aBlocked = a.blockedBy.some(id => unresolvedTaskIds.has(id))
        const bBlocked = b.blockedBy.some(id => unresolvedTaskIds.has(id))
        if (aBlocked !== bBlocked) {
          return aBlocked ? 1 : -1
        }
        return byIdAsc(a, b)
      })

    const prioritized = [
      ...recentCompleted,
      ...inProgress,
      ...pending,
      ...olderCompleted,
    ]
    visibleTasks = prioritized.slice(0, maxDisplay)
    hiddenTasks = prioritized.slice(maxDisplay)
  } else {
    // No truncation needed — sort by ID for stable ordering
    visibleTasks = [...tasks].sort(byIdAsc)
    hiddenTasks = []
  }

  let hiddenSummary = ''
  if (hiddenTasks.length > 0) {
    const parts: string[] = []
    const hiddenPending = count(hiddenTasks, t => t.status === 'pending')
    const hiddenInProgress = count(hiddenTasks, t => t.status === 'in_progress')
    const hiddenCompleted = count(hiddenTasks, t => t.status === 'completed')
    if (hiddenInProgress > 0) {
      parts.push(`${hiddenInProgress} in progress`)
    }
    if (hiddenPending > 0) {
      parts.push(`${hiddenPending} pending`)
    }
    if (hiddenCompleted > 0) {
      parts.push(`${hiddenCompleted} completed`)
    }
    hiddenSummary = ` … +${parts.join(', ')}`
  }

  const content = (
    <>
      {visibleTasks.map(task => (
        <TaskItem
          key={task.id}
          task={task}
          ownerColor={task.owner ? teammateColors[task.owner] : undefined}
          openBlockers={task.blockedBy.filter(id => unresolvedTaskIds.has(id))}
          activity={task.owner ? teammateActivity[task.owner] : undefined}
          ownerActive={task.owner ? activeTeammates.has(task.owner) : false}
          columns={columns}
        />
      ))}
      {maxDisplay > 0 && hiddenSummary && <Text dimColor>{hiddenSummary}</Text>}
    </>
  )

  if (isStandalone) {
    return (
      <Box flexDirection="column" marginTop={1} marginLeft={2}>
        <Box>
          <Text dimColor>
            <Text bold>{tasks.length}</Text>
            {' tasks ('}
            <Text bold>{completedCount}</Text>
            {' done, '}
            {inProgressCount > 0 && (
              <>
                <Text bold>{inProgressCount}</Text>
                {' in progress, '}
              </>
            )}
            <Text bold>{pendingCount}</Text>
            {' open)'}
          </Text>
        </Box>
        {content}
      </Box>
    )
  }

  return <Box flexDirection="column">{content}</Box>
}

type TaskItemProps = {
  task: Task
  ownerColor?: keyof Theme
  openBlockers: string[]
  activity?: string
  ownerActive: boolean
  columns: number
}

function getTaskIcon(status: Task['status']): {
  icon: string
  color: keyof Theme | undefined
} {
  switch (status) {
    case 'completed':
      return { icon: figures.tick, color: 'success' }
    case 'in_progress':
      return { icon: figures.squareSmallFilled, color: 'claude' }
    case 'pending':
      return { icon: figures.squareSmall, color: undefined }
  }
}

function TaskItem({
  task,
  ownerColor,
  openBlockers,
  activity,
  ownerActive,
  columns,
}: TaskItemProps): React.ReactNode {
  const isCompleted = task.status === 'completed'
  const isInProgress = task.status === 'in_progress'
  const isBlocked = openBlockers.length > 0

  const { icon, color } = getTaskIcon(task.status)

  const showActivity = isInProgress && !isBlocked && activity

  // Responsive layout: hide owner on narrow screens (<60 cols)
  // Truncate subject based on available space
  const showOwner = columns >= 60 && task.owner && ownerActive
  const ownerWidth = showOwner ? stringWidth(` (@${task.owner})`) : 0
  // Account for: icon(2) + indentation(~8 when nested under spinner) + owner + safety
  // Use columns - 15 as a conservative estimate for nested layouts
  const maxSubjectWidth = Math.max(15, columns - 15 - ownerWidth)
  const displaySubject = truncateToWidth(task.subject, maxSubjectWidth)

  // Truncate activity for narrow screens
  const maxActivityWidth = Math.max(15, columns - 15)
  const displayActivity = activity
    ? truncateToWidth(activity, maxActivityWidth)
    : undefined

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={color}>{icon} </Text>
        <Text
          bold={isInProgress}
          strikethrough={isCompleted}
          dimColor={isCompleted || isBlocked}
        >
          {displaySubject}
        </Text>
        {showOwner && (
          <Text dimColor>
            {' ('}
            {ownerColor ? (
              <ThemedText color={ownerColor}>@{task.owner}</ThemedText>
            ) : (
              `@${task.owner}`
            )}
            {')'}
          </Text>
        )}
        {isBlocked && (
          <Text dimColor>
            {' '}
            {figures.pointerSmall} blocked by{' '}
            {[...openBlockers]
              .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
              .map(id => `#${id}`)
              .join(', ')}
          </Text>
        )}
      </Box>
      {showActivity && displayActivity && (
        <Box>
          <Text dimColor>
            {'  '}
            {displayActivity}
            {figures.ellipsis}
          </Text>
        </Box>
      )}
    </Box>
  )
}
