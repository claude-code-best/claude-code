import React, { useRef } from 'react'
import type { RemoteAgentTaskState } from 'src/tasks/RemoteAgentTask/RemoteAgentTask.js'
import type { DeepImmutable } from 'src/types/utils.js'
import { DIAMOND_FILLED, DIAMOND_OPEN } from '../../constants/figures.js'
import { useSettings } from '../../hooks/useSettings.js'
import { Text, useAnimationFrame } from '@anthropic/ink'
import { count } from '../../utils/array.js'
import { getRainbowColor } from '../../utils/thinking.js'

const TICK_MS = 80

type ReviewStage = NonNullable<
  NonNullable<RemoteAgentTaskState['reviewProgress']>['stage']
>

/**
 * Stage-appropriate counts line for a running review. Shared between the
 * one-line pill (below) and RemoteSessionDetailDialog's reviewCountsLine so
 * the two can't drift — they have historically disagreed on whether to show
 * refuted counts and what to call the synthesizing stage.
 *
 * Canonical behavior: word labels (not ✓/✗), hide refuted when 0, "deduping"
 * for the synthesizing stage (matches STAGE_LABELS in the detail dialog).
 */
export function formatReviewStageCounts(
  stage: ReviewStage | undefined,
  found: number,
  verified: number,
  refuted: number,
): string {
  // Pre-stage orchestrator images don't write the stage field.
  if (!stage) return `${found} found · ${verified} verified`
  if (stage === 'synthesizing') {
    const parts = [`${verified} verified`]
    if (refuted > 0) parts.push(`${refuted} refuted`)
    parts.push('deduping')
    return parts.join(' · ')
  }
  if (stage === 'verifying') {
    const parts = [`${found} found`, `${verified} verified`]
    if (refuted > 0) parts.push(`${refuted} refuted`)
    return parts.join(' · ')
  }
  // stage === 'finding'
  return found > 0 ? `${found} found` : 'finding'
}

// Per-character rainbow gradient, same treatment as the ultraplan keyword.
// The phase offset lets the gradient cycle — so the colors sweep along the
// text on each animation frame instead of being static.
function RainbowText({
  text,
  phase = 0,
}: {
  text: string
  phase?: number
}): React.ReactNode {
  return (
    <>
      {[...text].map((ch, i) => (
        <Text key={i} color={getRainbowColor(i + phase)}>
          {ch}
        </Text>
      ))}
    </>
  )
}

// Smooth-tick a count toward target, +1 per frame. Same pattern as the
// token counter in SpinnerAnimationRow — the ref survives re-renders and
// the animation clock drives the tick. Target jumps (2→5) display as
// 2→3→4→5 instead of snapping. When `snap` is set (reduced motion, or
// the clock is frozen), bypass the tick and jump straight to target —
// otherwise a frozen `time` would leave the ref stuck at its init value.
function useSmoothCount(target: number, time: number, snap: boolean): number {
  const displayed = useRef(target)
  const lastTick = useRef(time)
  if (snap || target < displayed.current) {
    displayed.current = target
  } else if (target > displayed.current && time !== lastTick.current) {
    displayed.current += 1
    lastTick.current = time
  }
  return displayed.current
}

function ReviewRainbowLine({
  session,
}: {
  session: DeepImmutable<RemoteAgentTaskState>
}): React.ReactNode {
  const settings = useSettings()
  const reducedMotion = settings.prefersReducedMotion ?? false
  const p = session.reviewProgress
  const running = session.status === 'running'
  // Animation clock runs only while running — completed/failed are static.
  // Disabled entirely when the user prefers reduced motion.
  //
  // The ref is intentionally discarded: this component is rendered inside
  // <Text> wrappers (BackgroundTasksDialog, RemoteSessionDetailDialog), and
  // Ink can't nest <Box> inside <Text>. Dropping the ref means
  // useTerminalViewport's isVisible stays true, so the clock ticks even when
  // scrolled off-screen — acceptable for a single 30-char line.
  const [, time] = useAnimationFrame(running && !reducedMotion ? TICK_MS : null)

  const targetFound = p?.bugsFound ?? 0
  const targetVerified = p?.bugsVerified ?? 0
  const targetRefuted = p?.bugsRefuted ?? 0
  // snap when the clock isn't advancing (reduced motion, or not running) —
  // useAnimationFrame(null) freezes `time` at its mount value, which would
  // leave the tick-gate permanently false.
  const snap = reducedMotion || !running
  const found = useSmoothCount(targetFound, time, snap)
  const verified = useSmoothCount(targetVerified, time, snap)
  const refuted = useSmoothCount(targetRefuted, time, snap)

  // Phase advances every 3 ticks so the gradient sweep is visible but
  // not frantic. Modulo keeps it in the 7-color cycle.
  const phase = Math.floor(time / (TICK_MS * 3)) % 7

  // ◇ open diamond while running (teal, matches cloud-session accent), ◆
  // filled when terminal. Rainbow is scoped to the word `ultrareview` only —
  // per design feedback, "there is a limit to the glittering rainbow".
  // Counts stay dimColor.
  if (session.status === 'completed') {
    return (
      <>
        <Text color="background">{DIAMOND_FILLED} </Text>
        <RainbowText text="ultrareview" phase={0} />
        <Text dimColor> ready · shift+↓ to view</Text>
      </>
    )
  }
  if (session.status === 'failed') {
    return (
      <>
        <Text color="background">{DIAMOND_FILLED} </Text>
        <RainbowText text="ultrareview" phase={0} />
        <Text color="error" dimColor>
          {' · '}
          error
        </Text>
      </>
    )
  }

  // The !p branch ("setting up") covers the window before the orchestrator
  // writes its first progress snapshot — container boot + repo clone can
  // take 1-3 min, during which "0 found" looked hung.
  const tail = !p
    ? 'setting up'
    : formatReviewStageCounts(p.stage, found, verified, refuted)
  return (
    <>
      <Text color="background">{DIAMOND_OPEN} </Text>
      <RainbowText text="ultrareview" phase={running ? phase : 0} />
      <Text dimColor> · {tail}</Text>
    </>
  )
}

export function RemoteSessionProgress({
  session,
}: {
  session: DeepImmutable<RemoteAgentTaskState>
}): React.ReactNode {
  // Lite-review: rainbow gradient over the full line, ultraplan-style.
  // BackgroundTask.tsx delegates the whole <Text> wrapper here so the
  // gradient spans the title, not just the trailing status.
  if (session.isRemoteReview) {
    return <ReviewRainbowLine session={session} />
  }

  if (session.status === 'completed') {
    return (
      <Text bold color="success" dimColor>
        done
      </Text>
    )
  }

  if (session.status === 'failed') {
    return (
      <Text bold color="error" dimColor>
        error
      </Text>
    )
  }

  if (!session.todoList.length) {
    return <Text dimColor>{session.status}…</Text>
  }

  const completed = count(session.todoList, _ => _.status === 'completed')
  const total = session.todoList.length
  return (
    <Text dimColor>
      {completed}/{total}
    </Text>
  )
}
