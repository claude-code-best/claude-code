/**
 * CoordinatorTaskPanel — Steerable list of background agents.
 *
 * Renders below the prompt input footer whenever local_agent tasks exist.
 * Visibility is driven by evictAfter: undefined (running/retained) shows
 * always; a timestamp shows until passed. Enter to view/steer, x to dismiss.
 */

import figures from 'figures'
import * as React from 'react'
import { BLACK_CIRCLE, PAUSE_ICON, PLAY_ICON } from '../constants/figures.js'
import { useTerminalSize } from '../hooks/useTerminalSize.js'
import { stringWidth } from '../ink/stringWidth.js'
import { Box, Text, wrapText } from '../ink.js'
import {
  type AppState,
  useAppState,
  useSetAppState,
} from '../state/AppState.js'
import {
  enterTeammateView,
  exitTeammateView,
} from '../state/teammateViewHelpers.js'
import {
  isPanelAgentTask,
  type LocalAgentTaskState,
} from '../tasks/LocalAgentTask/LocalAgentTask.js'
import { formatDuration, formatNumber } from '../utils/format.js'
import { evictTerminalTask } from '../utils/task/framework.js'
import { isTerminalStatus } from './tasks/taskStatusUtils.js'

/**
 * Which panel-managed tasks currently have a visible row.
 * Presence in AppState.tasks IS visibility — the 1s tick in
 * CoordinatorTaskPanel evicts tasks past their evictAfter deadline. The
 * evictAfter !== 0 check handles immediate dismiss (x key) without making
 * the filter time-dependent. Shared by panel render, useCoordinatorTaskCount,
 * and index resolvers so the math can't drift.
 */
export function getVisibleAgentTasks(
  tasks: AppState['tasks'],
): LocalAgentTaskState[] {
  return Object.values(tasks)
    .filter(
      (t): t is LocalAgentTaskState =>
        isPanelAgentTask(t) && t.evictAfter !== 0,
    )
    .sort((a, b) => a.startTime - b.startTime)
}

export function CoordinatorTaskPanel(): React.ReactNode {
  const tasks = useAppState(s => s.tasks)
  const viewingAgentTaskId = useAppState(s => s.viewingAgentTaskId)
  const agentNameRegistry = useAppState(s => s.agentNameRegistry)
  const coordinatorTaskIndex = useAppState(s => s.coordinatorTaskIndex)
  const tasksSelected = useAppState(s => s.footerSelection === 'tasks')
  const selectedIndex = tasksSelected ? coordinatorTaskIndex : undefined
  const setAppState = useSetAppState()

  const visibleTasks = getVisibleAgentTasks(tasks)
  const hasTasks = Object.values(tasks).some(isPanelAgentTask)

  // 1s tick: re-render for elapsed time + evict tasks past their deadline.
  // The eviction deletes from prev.tasks, which makes useCoordinatorTaskCount
  // (and other consumers) see the updated count without their own tick.
  const tasksRef = React.useRef(tasks)
  tasksRef.current = tasks
  const [, setTick] = React.useState(0)
  React.useEffect(() => {
    if (!hasTasks) return
    const interval = setInterval(
      (tasksRef, setAppState, setTick) => {
        const now = Date.now()
        for (const t of Object.values(tasksRef.current)) {
          if (isPanelAgentTask(t) && (t.evictAfter ?? Infinity) <= now) {
            evictTerminalTask(t.id, setAppState)
          }
        }
        setTick((prev: number) => prev + 1)
      },
      1000,
      tasksRef,
      setAppState,
      setTick,
    )
    return () => clearInterval(interval)
  }, [hasTasks, setAppState])
  const nameByAgentId = React.useMemo(() => {
    const inv = new Map<string, string>()
    for (const [n, id] of agentNameRegistry) inv.set(id, n)
    return inv
  }, [agentNameRegistry])

  if (visibleTasks.length === 0) {
    return null
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <MainLine
        isSelected={selectedIndex === 0}
        isViewed={viewingAgentTaskId === undefined}
        onClick={() => exitTeammateView(setAppState)}
      />
      {visibleTasks.map((task, i) => (
        <AgentLine
          key={task.id}
          task={task}
          name={nameByAgentId.get(task.id)}
          isSelected={selectedIndex === i + 1}
          isViewed={viewingAgentTaskId === task.id}
          onClick={() => enterTeammateView(task.id, setAppState)}
        />
      ))}
    </Box>
  )
}

/**
 * Returns the number of visible coordinator tasks (for selection bounds).
 * The panel's 1s tick evicts expired tasks from prev.tasks, so this count
 * stays accurate without needing its own tick.
 */
export function useCoordinatorTaskCount(): number {
  const tasks = useAppState(s => s.tasks)
  return React.useMemo(() => {
    if ("external" !== 'ant') return 0
    const count = getVisibleAgentTasks(tasks).length
    return count > 0 ? count + 1 : 0
  }, [tasks])
}

function MainLine({
  isSelected,
  isViewed,
  onClick,
}: {
  isSelected?: boolean
  isViewed?: boolean
  onClick: () => void
}): React.ReactNode {
  const [hover, setHover] = React.useState(false)
  const prefix = isSelected || hover ? figures.pointer + ' ' : '  '
  const bullet = isViewed ? BLACK_CIRCLE : figures.circle
  return (
    <Box
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <Text dimColor={!isSelected && !isViewed && !hover} bold={isViewed}>
        {prefix}
        {bullet} main
      </Text>
    </Box>
  )
}

type AgentLineProps = {
  task: LocalAgentTaskState
  name?: string
  isSelected?: boolean
  isViewed?: boolean
  onClick?: () => void
}

function AgentLine({
  task,
  name,
  isSelected,
  isViewed,
  onClick,
}: AgentLineProps): React.ReactNode {
  const { columns } = useTerminalSize()
  const [hover, setHover] = React.useState(false)
  const isRunning = !isTerminalStatus(task.status)
  const pausedMs = task.totalPausedMs ?? 0
  const elapsedMs = Math.max(
    0,
    isRunning
      ? Date.now() - task.startTime - pausedMs
      : (task.endTime ?? task.startTime) - task.startTime - pausedMs,
  )

  const elapsed = formatDuration(elapsedMs)
  const tokenCount = task.progress?.tokenCount

  // Derive direction arrow from activity state, same logic as Spinner
  const lastActivity = task.progress?.lastActivity
  const arrow = lastActivity ? figures.arrowDown : figures.arrowUp

  const tokenText =
    tokenCount !== undefined && tokenCount > 0
      ? ` · ${arrow} ${formatNumber(tokenCount)} tokens`
      : ''

  const queuedCount = task.pendingMessages.length
  const queuedText = queuedCount > 0 ? ` · ${queuedCount} queued` : ''

  // Precedence: AI summary > static description (no tool-call activity noise)
  const displayDescription = task.progress?.summary || task.description

  const highlighted = isSelected || hover
  const prefix = highlighted ? figures.pointer + ' ' : '  '
  const bullet = isViewed ? BLACK_CIRCLE : figures.circle
  const dim = !highlighted && !isViewed

  const sep = isRunning ? PLAY_ICON : PAUSE_ICON
  // Name is the steering handle — kept out of truncation and undimmed so it
  // stays readable even when the row is inactive. Short by convention (the
  // Agent tool prompt asks for "one or two words, lowercase").
  const namePart = name ? `${name}: ` : ''
  const hintPart =
    isSelected && !isViewed ? ` · x to ${isRunning ? 'stop' : 'clear'}` : ''
  const suffixPart = ` ${sep} ${elapsed}${tokenText}${queuedText}${hintPart}`
  const availableForDesc =
    columns -
    stringWidth(prefix) -
    stringWidth(`${bullet} `) -
    stringWidth(namePart) -
    stringWidth(suffixPart)
  const truncated = wrapText(
    displayDescription,
    Math.max(0, availableForDesc),
    'truncate-end',
  )

  const line = (
    <Text dimColor={dim} bold={isViewed}>
      {prefix}
      {bullet}{' '}
      {name && (
        <>
          <Text dimColor={false} bold>
            {name}
          </Text>
          {': '}
        </>
      )}
      {truncated} {sep} {elapsed}
      {tokenText}
      {queuedCount > 0 && <Text color="warning">{queuedText}</Text>}
      {hintPart && <Text dimColor>{hintPart}</Text>}
    </Text>
  )

  if (!onClick) return line
  return (
    <Box
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {line}
    </Box>
  )
}
