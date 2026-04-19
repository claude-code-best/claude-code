// biome-ignore-all assist/source/organizeImports: ANT-ONLY import markers must not be reordered
import { Box, Text, stringWidth } from '@anthropic/ink'
import * as React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  computeGlimmerIndex,
  computeShimmerSegments,
  SHIMMER_INTERVAL_MS,
} from '../bridge/bridgeStatusUtil.js'
import { feature } from 'bun:bundle'
import { getKairosActive, getUserMsgOptIn } from '../bootstrap/state.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import { isEnvTruthy } from '../utils/envUtils.js'
import { count } from '../utils/array.js'
import sample from 'lodash-es/sample.js'
import {
  formatDuration,
  formatNumber,
  formatSecondsShort,
} from '../utils/format.js'
import type { Theme } from 'src/utils/theme.js'
import { activityManager } from '../utils/activityManager.js'
import { getSpinnerVerbs } from '../constants/spinnerVerbs.js'
import { MessageResponse } from './MessageResponse.js'
import { TaskListV2 } from './TaskListV2.js'
import { useTasksV2 } from '../hooks/useTasksV2.js'
import type { Task } from '../utils/tasks.js'
import { useAppState } from '../state/AppState.js'
import { useTerminalSize } from '../hooks/useTerminalSize.js'
import { getDefaultCharacters, type SpinnerMode } from './Spinner/index.js'
import { SpinnerAnimationRow } from './Spinner/SpinnerAnimationRow.js'
import { useSettings } from '../hooks/useSettings.js'
import { isInProcessTeammateTask } from '../tasks/InProcessTeammateTask/types.js'
import { isBackgroundTask } from '../tasks/types.js'
import { getAllInProcessTeammateTasks } from '../tasks/InProcessTeammateTask/InProcessTeammateTask.js'
import { getEffortSuffix } from '../utils/effort.js'
import { getMainLoopModel } from '../utils/model/model.js'
import { getViewedTeammateTask } from '../state/selectors.js'
import { TEARDROP_ASTERISK } from '../constants/figures.js'
import figures from 'figures'
import {
  getCurrentTurnTokenBudget,
  getTurnOutputTokens,
} from '../bootstrap/state.js'

import { TeammateSpinnerTree } from './Spinner/TeammateSpinnerTree.js'
import { useAnimationFrame } from '@anthropic/ink'
import { getGlobalConfig } from '../utils/config.js'
export type { SpinnerMode } from './Spinner/index.js'

const DEFAULT_CHARACTERS = getDefaultCharacters()

const SPINNER_FRAMES = [
  ...DEFAULT_CHARACTERS,
  ...[...DEFAULT_CHARACTERS].reverse(),
]


type Props = {
  mode: SpinnerMode
  loadingStartTimeRef: React.RefObject<number>
  totalPausedMsRef: React.RefObject<number>
  pauseStartTimeRef: React.RefObject<number | null>
  spinnerTip?: string
  responseLengthRef: React.RefObject<number>
  apiMetricsRef?: React.RefObject<
    Array<{
      ttftMs: number;
      firstTokenTime: number;
      lastTokenTime: number;
      responseLengthBaseline: number;
      endResponseLength: number;
    }>
  >
  overrideColor?: keyof Theme | null
  overrideShimmerColor?: keyof Theme | null
  overrideMessage?: string | null
  spinnerSuffix?: string | null
  verbose: boolean
  hasActiveTools?: boolean
  /** Leader's turn has completed (no active query). Used to suppress stall-red spinner when only teammates are running. */
  leaderIsIdle?: boolean
}

// Thin wrapper: branches on isBriefOnly so the two variants have independent
// hook call chains. Without this split, toggling /brief mid-render would
// violate Rules of Hooks (the inner variant calls ~10 more hooks).
export function SpinnerWithVerb(props: Props): React.ReactNode {
  const isBriefOnly = useAppState(s => s.isBriefOnly)
  // REPL overrides isBriefOnly→false when viewing a teammate transcript
  // (see isBriefOnly={viewedTeammateTask ? false : isBriefOnly}). That
  // prop isn't threaded here, so replicate the gate from the store —
  // teammate view needs the real spinner (which shows teammate status).
  const viewingAgentTaskId = useAppState(s => s.viewingAgentTaskId)
  // Hoisted to mount-time — this component re-renders at animation framerate.
  const briefEnvEnabled =
    feature('KAIROS') || feature('KAIROS_BRIEF')
      ?
        useMemo(() => isEnvTruthy(process.env.CLAUDE_CODE_BRIEF), [])
      : false

  // Runtime gate mirrors isBriefEnabled() but inlined — importing from
  // BriefTool.ts would leak tool-name strings into external builds. Single
  // spinner instance → hooks stay unconditional (two subs, negligible).
  if (
    (feature('KAIROS') || feature('KAIROS_BRIEF')) &&
    (getKairosActive() ||
      (getUserMsgOptIn() &&
        (briefEnvEnabled ||
          getFeatureValue_CACHED_MAY_BE_STALE('tengu_kairos_brief', false)))) &&
    isBriefOnly &&
    !viewingAgentTaskId
  ) {
    return (
      <BriefSpinner mode={props.mode} overrideMessage={props.overrideMessage} />
    )
  }

  return <SpinnerWithVerbInner {...props} />
}

function SpinnerWithVerbInner({
  mode,
  loadingStartTimeRef,
  totalPausedMsRef,
  pauseStartTimeRef,
  spinnerTip,
  responseLengthRef,
  overrideColor,
  overrideShimmerColor,
  overrideMessage,
  spinnerSuffix,
  verbose,
  hasActiveTools = false,
  leaderIsIdle = false,
}: Props): React.ReactNode {
  const settings = useSettings()
  const reducedMotion = settings.prefersReducedMotion ?? false

  // NOTE: useAnimationFrame(50) lives in SpinnerAnimationRow, not here.
  // This component only re-renders when props or app state change —
  // it is no longer on the 50ms clock. All `time`-derived values
  // (frame, glimmer, stalled intensity, token counter, thinking shimmer,
  // elapsed-time timer) are computed inside the child.

  const tasks = useAppState(s => s.tasks)
  const viewingAgentTaskId = useAppState(s => s.viewingAgentTaskId)
  const expandedView = useAppState(s => s.expandedView)
  const showExpandedTodos = expandedView === 'tasks'
  const showSpinnerTree = expandedView === 'teammates'
  const selectedIPAgentIndex = useAppState(s => s.selectedIPAgentIndex)
  const viewSelectionMode = useAppState(s => s.viewSelectionMode)
  // Get foregrounded teammate (if viewing a teammate's transcript)
  const foregroundedTeammate = viewingAgentTaskId
    ? getViewedTeammateTask({ viewingAgentTaskId, tasks })
    : undefined
  const { columns } = useTerminalSize()
  const tasksV2 = useTasksV2()

  // Track thinking status: 'thinking' | number (duration in ms) | null
  // Shows each state for minimum 2s to avoid UI jank
  const [thinkingStatus, setThinkingStatus] = useState<
    'thinking' | number | null
  >(null)
  const thinkingStartRef = useRef<number | null>(null)

  useEffect(() => {
    let showDurationTimer: ReturnType<typeof setTimeout> | null = null
    let clearStatusTimer: ReturnType<typeof setTimeout> | null = null

    if (mode === 'thinking') {
      // Started thinking
      if (thinkingStartRef.current === null) {
        thinkingStartRef.current = Date.now()
        setThinkingStatus('thinking')
      }
    } else if (thinkingStartRef.current !== null) {
      // Stopped thinking - calculate duration and ensure 2s minimum display
      const duration = Date.now() - thinkingStartRef.current
      const elapsed = Date.now() - thinkingStartRef.current
      const remainingThinkingTime = Math.max(0, 2000 - elapsed)

      thinkingStartRef.current = null

      // Show "thinking..." for remaining time if < 2s elapsed, then show duration
      const showDuration = (): void => {
        setThinkingStatus(duration)
        // Clear after 2s
        clearStatusTimer = setTimeout(setThinkingStatus, 2000, null)
      }

      if (remainingThinkingTime > 0) {
        showDurationTimer = setTimeout(showDuration, remainingThinkingTime)
      } else {
        showDuration()
      }
    }

    return () => {
      if (showDurationTimer) clearTimeout(showDurationTimer)
      if (clearStatusTimer) clearTimeout(clearStatusTimer)
    }
  }, [mode])

  // Find the current in-progress task and next pending task
  const currentTodo = tasksV2?.find(
    task => task.status !== 'pending' && task.status !== 'completed',
  )
  const nextTask = findNextPendingTask(tasksV2)

  // Use useState with initializer to pick a random verb once on mount
  const [randomVerb] = useState(() => sample(getSpinnerVerbs()))

  // Leader's own verb (always the leader's, regardless of who is foregrounded)
  const leaderVerb =
    overrideMessage ??
    currentTodo?.activeForm ??
    currentTodo?.subject ??
    randomVerb

  const effectiveVerb =
    foregroundedTeammate && !foregroundedTeammate.isIdle
      ? (foregroundedTeammate.spinnerVerb ?? randomVerb)
      : leaderVerb
  const message = effectiveVerb + '…'

  // Track CLI activity when spinner is active
  useEffect(() => {
    const operationId = 'spinner-' + mode
    activityManager.startCLIActivity(operationId)
    return () => {
      activityManager.endCLIActivity(operationId)
    }
  }, [mode])

  const effortValue = useAppState(s => s.effortValue)
  const effortSuffix = getEffortSuffix(getMainLoopModel(), effortValue)

  // Check if any running in-process teammates exist (needed for both modes)
  const runningTeammates = getAllInProcessTeammateTasks(tasks).filter(
    t => t.status === 'running',
  )
  const hasRunningTeammates = runningTeammates.length > 0
  const allIdle = hasRunningTeammates && runningTeammates.every(t => t.isIdle)

  // Gather aggregate token stats from all running swarm teammates
  // In spinner-tree mode, skip aggregation (teammates have their own lines in the tree)
  let teammateTokens = 0
  if (!showSpinnerTree) {
    for (const task of Object.values(tasks)) {
      if (isInProcessTeammateTask(task) && task.status === 'running') {
        if (task.progress?.tokenCount) {
          teammateTokens += task.progress.tokenCount
        }
      }
    }
  }

  // Stale read of the refs for showBtwTip below — we're off the 50ms clock
  // so this only updates when props/app state change, which is sufficient for
  // a coarse 30s threshold.
  const elapsedSnapshot =
    pauseStartTimeRef.current !== null
      ? pauseStartTimeRef.current -
        loadingStartTimeRef.current -
        totalPausedMsRef.current
      : Date.now() - loadingStartTimeRef.current - totalPausedMsRef.current

  // Leader token count for TeammateSpinnerTree — read raw (non-animated) from
  // the ref. The tree is only shown when teammates are running; teammate
  // progress updates to s.tasks trigger re-renders that keep this fresh.
  const leaderTokenCount = Math.round(responseLengthRef.current / 4)

  const defaultColor: keyof Theme = 'claude'
  const defaultShimmerColor = 'claudeShimmer'
  const messageColor = overrideColor ?? defaultColor
  const shimmerColor = overrideShimmerColor ?? defaultShimmerColor

  // TTFT display is gated to internal builds — apiMetricsRef was removed from
  // props during a refactor, so skip this until it's re-threaded.
  let ttftText: string | null = null

  // When leader is idle but teammates are running (and we're viewing the leader),
  // show a static dim idle display instead of the animated spinner — otherwise
  // useStalledAnimation detects no new tokens after 3s and turns the spinner red.
  if (leaderIsIdle && hasRunningTeammates && !foregroundedTeammate) {
    return (
      <Box flexDirection="column" width="100%" alignItems="flex-start">
        <Box flexDirection="row" flexWrap="wrap" marginTop={1} width="100%">
          <Text dimColor>
            {TEARDROP_ASTERISK} Idle
            {!allIdle && ' · teammates running'}
          </Text>
        </Box>
        {showSpinnerTree && (
          <TeammateSpinnerTree
            selectedIndex={selectedIPAgentIndex}
            isInSelectionMode={viewSelectionMode === 'selecting-agent'}
            allIdle={allIdle}
            leaderTokenCount={leaderTokenCount}
            leaderIdleText="Idle"
          />
        )}
      </Box>
    )
  }

  // When viewing an idle teammate, show static idle display instead of animated spinner
  if (foregroundedTeammate?.isIdle) {
    const idleText = allIdle
      ? `${TEARDROP_ASTERISK} Worked for ${formatDuration(Date.now() - foregroundedTeammate.startTime)}`
      : `${TEARDROP_ASTERISK} Idle`
    return (
      <Box flexDirection="column" width="100%" alignItems="flex-start">
        <Box flexDirection="row" flexWrap="wrap" marginTop={1} width="100%">
          <Text dimColor>{idleText}</Text>
        </Box>
        {showSpinnerTree && hasRunningTeammates && (
          <TeammateSpinnerTree
            selectedIndex={selectedIPAgentIndex}
            isInSelectionMode={viewSelectionMode === 'selecting-agent'}
            allIdle={allIdle}
            leaderVerb={leaderIsIdle ? undefined : leaderVerb}
            leaderIdleText={leaderIsIdle ? 'Idle' : undefined}
            leaderTokenCount={leaderTokenCount}
          />
        )}
      </Box>
    )
  }

  // Time-based tip overrides: coarse thresholds so a stale ref read (we're
  // off the 50ms clock) is fine. Other triggers (mode change, setMessages)
  // cause re-renders that refresh this in practice.
  let contextTipsActive = false
  const tipsEnabled = settings.spinnerTipsEnabled !== false
  const showClearTip = tipsEnabled && elapsedSnapshot > 1_800_000
  const showBtwTip =
    tipsEnabled && elapsedSnapshot > 30_000 && !getGlobalConfig().btwUseCount

  const effectiveTip = contextTipsActive
    ? undefined
    : showClearTip && !nextTask
      ? 'Use /clear to start fresh when switching topics and free up context'
      : showBtwTip && !nextTask
        ? "Use /btw to ask a quick side question without interrupting Claude's current work"
        : spinnerTip

  // Budget text (ant-only) — shown above the tip line
  let budgetText: string | null = null
  if (feature('TOKEN_BUDGET')) {
    const budget = getCurrentTurnTokenBudget()
    if (budget !== null && budget > 0) {
      const tokens = getTurnOutputTokens()
      if (tokens >= budget) {
        budgetText = `Target: ${formatNumber(tokens)} used (${formatNumber(budget)} min ${figures.tick})`
      } else {
        const pct = Math.round((tokens / budget) * 100)
        const remaining = budget - tokens
        const rate =
          elapsedSnapshot > 5000 && tokens >= 2000
            ? tokens / elapsedSnapshot
            : 0
        const eta =
          rate > 0
            ? ` \u00B7 ~${formatDuration(remaining / rate, { mostSignificantOnly: true })}`
            : ''
        budgetText = `Target: ${formatNumber(tokens)} / ${formatNumber(budget)} (${pct}%)${eta}`
      }
    }
  }

  return (
    <Box flexDirection="column" width="100%" alignItems="flex-start">
      <SpinnerAnimationRow
        mode={mode}
        reducedMotion={reducedMotion}
        hasActiveTools={hasActiveTools}
        responseLengthRef={responseLengthRef}
        message={message}
        messageColor={messageColor}
        shimmerColor={shimmerColor}
        overrideColor={overrideColor}
        loadingStartTimeRef={loadingStartTimeRef}
        totalPausedMsRef={totalPausedMsRef}
        pauseStartTimeRef={pauseStartTimeRef}
        spinnerSuffix={spinnerSuffix}
        verbose={verbose}
        columns={columns}
        hasRunningTeammates={hasRunningTeammates}
        teammateTokens={teammateTokens}
        foregroundedTeammate={foregroundedTeammate}
        leaderIsIdle={leaderIsIdle}
        thinkingStatus={thinkingStatus}
        effortSuffix={effortSuffix}
      />
      {showSpinnerTree && hasRunningTeammates ? (
        <TeammateSpinnerTree
          selectedIndex={selectedIPAgentIndex}
          isInSelectionMode={viewSelectionMode === 'selecting-agent'}
          allIdle={allIdle}
          leaderVerb={leaderIsIdle ? undefined : leaderVerb}
          leaderIdleText={leaderIsIdle ? 'Idle' : undefined}
          leaderTokenCount={leaderTokenCount}
        />
      ) : showExpandedTodos && tasksV2 && tasksV2.length > 0 ? (
        <Box width="100%" flexDirection="column">
          <MessageResponse>
            <TaskListV2 tasks={tasksV2} />
          </MessageResponse>
        </Box>
      ) : nextTask || effectiveTip || budgetText ? (
        // IMPORTANT: we need this width="100%" to avoid an Ink bug where the
        // tip gets duplicated over and over while the spinner is running if
        // the terminal is very small. TODO: fix this in Ink.
        <Box width="100%" flexDirection="column">
          {budgetText && (
            <MessageResponse>
              <Text dimColor>{budgetText}</Text>
            </MessageResponse>
          )}
          {(nextTask || effectiveTip) && (
            <MessageResponse>
              <Text dimColor>
                {nextTask
                  ? `Next: ${nextTask.subject}`
                  : `Tip: ${effectiveTip}`}
              </Text>
            </MessageResponse>
          )}
        </Box>
      ) : null}
    </Box>
  )
}

// Brief/assistant mode spinner: single status line. PromptInput drops its
// own marginTop when isBriefOnly is active, so this component owns the
// 2-row footprint between messages and input. Footprint is [blank, content]
// — one blank row above (breathing room under the messages list), spinner
// flush against the input bar. PromptInput's absolute-positioned
// Notifications overlay compensates with marginTop=-2 in brief mode
// (PromptInput.tsx:~2928) so it floats into the blank row above the
// spinner, not over the spinner content. Paired with BriefIdleStatus which
// keeps the same footprint when idle.
type BriefSpinnerProps = {
  mode: SpinnerMode
  overrideMessage?: string | null
}

function BriefSpinner({
  mode,
  overrideMessage,
}: BriefSpinnerProps): React.ReactNode {
  const settings = useSettings()
  const reducedMotion = settings.prefersReducedMotion ?? false
  const [randomVerb] = useState(() => sample(getSpinnerVerbs()) ?? 'Working')
  const verb = overrideMessage ?? randomVerb
  const connStatus = useAppState(s => s.remoteConnectionStatus)

  // Track CLI activity so OS/IDE "busy" indicators fire in brief mode too
  useEffect(() => {
    const operationId = 'spinner-' + mode
    activityManager.startCLIActivity(operationId)
    return () => {
      activityManager.endCLIActivity(operationId)
    }
  }, [mode])

  // Drive both dot cycle and shimmer from the shared clock. The viewport
  // ref is unused — the spinner unmounts on turn end so viewport-based
  // pausing isn't needed.
  const [, time] = useAnimationFrame(reducedMotion ? null : 120)

  // Local tasks + remote tasks are mutually exclusive (viewer mode has an
  // empty local AppState.tasks; local mode has remoteBackgroundTaskCount=0).
  // Summing avoids a mode branch.
  const runningCount = useAppState(
    s =>
      count(Object.values(s.tasks), isBackgroundTask) +
      s.remoteBackgroundTaskCount,
  )

  // Connection trouble overrides the verb — `claude assistant` is a pure viewer,
  // nothing useful is happening while the WS is down.
  const showConnWarning =
    connStatus === 'reconnecting' || connStatus === 'disconnected'
  const connText =
    connStatus === 'reconnecting' ? 'Reconnecting' : 'Disconnected'

  // Dots padded to a fixed 3 columns so the right-aligned count doesn't
  // jitter as the cycle advances.
  const dotFrame = Math.floor(time / 300) % 3
  const dots = reducedMotion ? '…  ' : '.'.repeat(dotFrame + 1).padEnd(3)

  // Shimmer: reverse-sweep highlight across the verb. Skip for connection
  // warnings (shimmer reads as "working"; Reconnecting/Disconnected is not).
  const verbWidth = useMemo(() => stringWidth(verb), [verb])
  const glimmerIndex =
    reducedMotion || showConnWarning
      ? -100
      : computeGlimmerIndex(Math.floor(time / SHIMMER_INTERVAL_MS), verbWidth)
  const { before, shimmer, after } = computeShimmerSegments(verb, glimmerIndex)

  const { columns } = useTerminalSize()
  const rightText = runningCount > 0 ? `${runningCount} in background` : ''
  // Manual right-align via space padding — flexGrow spacers inside
  // FullscreenLayout's `main` slot don't resolve a width and caused the
  // diff engine to miss dot-frame updates.
  const leftWidth = (showConnWarning ? stringWidth(connText) : verbWidth) + 3
  const pad = Math.max(1, columns - 2 - leftWidth - stringWidth(rightText))

  return (
    <Box flexDirection="row" width="100%" marginTop={1} paddingLeft={2}>
      {showConnWarning ? (
        <Text color="error">{connText + dots}</Text>
      ) : (
        <>
          {before ? <Text dimColor>{before}</Text> : null}
          {shimmer ? <Text>{shimmer}</Text> : null}
          {after ? <Text dimColor>{after}</Text> : null}
          <Text dimColor>{dots}</Text>
        </>
      )}
      {rightText ? (
        <>
          <Text>{' '.repeat(pad)}</Text>
          <Text color="subtle">{rightText}</Text>
        </>
      ) : null}
    </Box>
  )
}

// Idle placeholder for brief mode. Same 2-row [blank, content] footprint
// as BriefSpinner so the input bar never jumps when toggling between
// working/idle/disconnected. See BriefSpinner's comment for the
// Notifications overlay coupling.
export function BriefIdleStatus(): React.ReactNode {
  const connStatus = useAppState(s => s.remoteConnectionStatus)
  const runningCount = useAppState(
    s =>
      count(Object.values(s.tasks), isBackgroundTask) +
      s.remoteBackgroundTaskCount,
  )
  const { columns } = useTerminalSize()

  const showConnWarning =
    connStatus === 'reconnecting' || connStatus === 'disconnected'
  const connText =
    connStatus === 'reconnecting' ? 'Reconnecting…' : 'Disconnected'
  const leftText = showConnWarning ? connText : ''
  const rightText = runningCount > 0 ? `${runningCount} in background` : ''

  if (!leftText && !rightText) return <Box height={2} />

  const pad = Math.max(
    1,
    columns - 2 - stringWidth(leftText) - stringWidth(rightText),
  )
  return (
    <Box marginTop={1} paddingLeft={2}>
      <Text>
        {leftText ? <Text color="error">{leftText}</Text> : null}
        {rightText ? (
          <>
            <Text>{' '.repeat(pad)}</Text>
            <Text color="subtle">{rightText}</Text>
          </>
        ) : null}
      </Text>
    </Box>
  )
}

export function Spinner(): React.ReactNode {
  const settings = useSettings()
  const reducedMotion = settings.prefersReducedMotion ?? false
  const [ref, time] = useAnimationFrame(reducedMotion ? null : 120)

  // Reduced motion: static dot instead of animated spinner
  if (reducedMotion) {
    return (
      <Box ref={ref} flexWrap="wrap" height={1} width={2}>
        <Text color="text">●</Text>
      </Box>
    )
  }

  // Derive frame from synced time - all spinners animate together
  const frame = Math.floor(time / 120) % SPINNER_FRAMES.length

  return (
    <Box ref={ref} flexWrap="wrap" height={1} width={2}>
      <Text color="text">{SPINNER_FRAMES[frame]}</Text>
    </Box>
  )
}


function findNextPendingTask(tasks: Task[] | undefined): Task | undefined {
  if (!tasks) {
    return undefined
  }
  const pendingTasks = tasks.filter(t => t.status === 'pending')
  if (pendingTasks.length === 0) {
    return undefined
  }
  const unresolvedIds = new Set(
    tasks.filter(t => t.status !== 'completed').map(t => t.id),
  )
  return (
    pendingTasks.find(t => !t.blockedBy.some(id => unresolvedIds.has(id))) ??
    pendingTasks[0]
  )
}
