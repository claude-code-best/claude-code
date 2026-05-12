import { useEffect, useRef } from 'react'
import { useAppStateStore, useSetAppState } from '../state/AppState.js'
import { isTerminalTaskStatus } from '../Task.js'
import {
  findTeammateTaskByAgentId,
  injectUserMessageToTeammate,
} from '../tasks/InProcessTeammateTask/InProcessTeammateTask.js'
import { isKairosCronEnabled } from '@claude-code-best/builtin-tools/tools/ScheduleCronTool/prompt.js'
import type { Message } from '../types/message.js'
import { getCwd } from '../utils/cwd.js'
import { getCronJitterConfig } from '../utils/cronJitterConfig.js'
import { createCronScheduler } from '../utils/cronScheduler.js'
import { removeCronTasks, type CronTask } from '../utils/cronTasks.js'
import {
  createAutonomyQueuedPrompt,
  createAutonomyQueuedPromptIfNoActiveSource,
  markAutonomyRunCancelled,
  markAutonomyRunFailed,
} from '../utils/autonomyRuns.js'
import { logForDebugging } from '../utils/debug.js'
import { enqueuePendingNotification } from '../utils/messageQueueManager.js'
import { createScheduledTaskFireMessage } from '../utils/messages.js'
import { WORKLOAD_CRON } from '../utils/workloadContext.js'
import type { QueuedCommand } from '../types/textInputTypes.js'

type Props = {
  isLoading: boolean
  /**
   * When true, bypasses the isLoading gate so tasks can enqueue while a
   * query is streaming rather than deferring to the next 1s check tick
   * after the turn ends. Assistant mode no longer forces --proactive
   * (#20425) so isLoading drops between turns like a normal REPL — this
   * bypass is now a latency nicety, not a starvation fix. The prompt is
   * enqueued at 'later' priority either way and drains between turns.
   */
  assistantMode?: boolean
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
}

export async function createScheduledTaskQueuedCommand(
  task: Pick<CronTask, 'id' | 'prompt'>,
  options?: {
    rootDir?: string
    currentDir?: string
    shouldCreate?: () => boolean
  },
): Promise<QueuedCommand | null> {
  const command = await createAutonomyQueuedPromptIfNoActiveSource({
    basePrompt: task.prompt,
    trigger: 'scheduled-task',
    rootDir: options?.rootDir,
    currentDir: options?.currentDir ?? getCwd(),
    sourceId: task.id,
    sourceLabel: task.prompt,
    workload: WORKLOAD_CRON,
    shouldCreate: options?.shouldCreate,
  })
  if (!command) {
    logForDebugging(
      `[ScheduledTasks] skipping ${task.id}: previous run still queued or running`,
    )
  }
  return command
}

/**
 * REPL wrapper for the cron scheduler. Mounts the scheduler once and tears
 * it down on unmount. Fired prompts go into the command queue as 'later'
 * priority, which the REPL drains via useCommandQueue between turns.
 *
 * Scheduler core (timer, file watcher, fire logic) lives in cronScheduler.ts
 * so SDK/-p mode can share it — see print.ts for the headless wiring.
 */
export function useScheduledTasks({
  isLoading,
  assistantMode = false,
  setMessages,
}: Props): void {
  // Latest-value ref so the scheduler's isLoading() getter doesn't capture
  // a stale closure. The effect mounts once; isLoading changes every turn.
  const isLoadingRef = useRef(isLoading)
  isLoadingRef.current = isLoading

  const store = useAppStateStore()
  const setAppState = useSetAppState()

  useEffect(() => {
    // Runtime gate checked here (not at the hook call site) so the hook
    // stays unconditionally mounted — rules-of-hooks forbid wrapping the
    // call in a dynamic condition. getFeatureValue_CACHED_WITH_REFRESH
    // reads from disk; the 5-min TTL fires a background refetch but the
    // effect won't re-run on value flip (assistantMode is the only dep),
    // so this guard alone is launch-grain. The mid-session killswitch is
    // the isKilled option below — check() polls it every tick.
    if (!isKairosCronEnabled()) return

    // System-generated — hidden from queue preview and transcript UI.
    // In brief mode, executeForkedSlashCommand runs as a background
    // subagent and returns no visible messages. In normal mode,
    // isMeta is only propagated for plain-text prompts (via
    // processTextPrompt); slash commands like /context:fork do not
    // forward isMeta, so their messages remain visible in the
    // transcript. This is acceptable since normal mode is not the
    // primary use case for scheduled tasks.
    let disposed = false
    const enqueueForLead = async (prompt: string) => {
      const command = await createAutonomyQueuedPrompt({
        basePrompt: prompt,
        trigger: 'scheduled-task',
        currentDir: getCwd(),
        workload: WORKLOAD_CRON,
        shouldCreate: () => !disposed,
      })
      if (!command) {
        return
      }
      if (disposed) {
        await markAutonomyRunCancelled(
          command.autonomy!.runId,
          command.autonomy!.rootDir,
        )
        return
      }
      enqueuePendingNotification(command)
    }

    const scheduler = createCronScheduler({
      // Missed-task surfacing (onFire fallback). Teammate crons are always
      // session-only (durable:false) so they never appear in the missed list,
      // which is populated from disk at scheduler startup — this path only
      // handles team-lead durable crons.
      onFire: prompt => {
        void enqueueForLead(prompt).catch(error =>
          logForDebugging(
            `[ScheduledTasks] failed to enqueue missed task prompt: ${error}`,
            { level: 'error' },
          ),
        )
      },
      // Normal fires receive the full CronTask so we can route by agentId.
      onFireTask: task => {
        void (async () => {
          if (task.agentId) {
            const teammate = findTeammateTaskByAgentId(
              task.agentId,
              store.getState().tasks,
            )
            if (teammate && !isTerminalTaskStatus(teammate.status)) {
              const command = await createScheduledTaskQueuedCommand(task, {
                shouldCreate: () => !disposed,
              })
              if (!command) {
                return
              }
              if (disposed) {
                await markAutonomyRunCancelled(
                  command.autonomy!.runId,
                  command.autonomy!.rootDir,
                )
                return
              }
              const injected = injectUserMessageToTeammate(
                teammate.id,
                command.value as string,
                {
                  autonomyRunId: command.autonomy?.runId,
                  autonomyRootDir: command.autonomy?.rootDir,
                  origin: command.origin,
                },
                setAppState,
              )
              if (!injected && command.autonomy?.runId) {
                await markAutonomyRunFailed(
                  command.autonomy.runId,
                  `Teammate ${task.agentId} exited before the scheduled message could be delivered.`,
                  command.autonomy.rootDir,
                )
              }
              return
            }
            // Teammate is gone — clean up the orphaned cron so it doesn't keep
            // firing into nowhere every tick. One-shots would auto-delete on
            // fire anyway, but recurring crons would loop until auto-expiry.
            logForDebugging(
              `[ScheduledTasks] teammate ${task.agentId} gone, removing orphaned cron ${task.id}`,
            )
            void removeCronTasks([task.id])
            return
          }

          const command = await createScheduledTaskQueuedCommand(task, {
            shouldCreate: () => !disposed,
          })
          if (!command) {
            return
          }
          if (disposed) {
            await markAutonomyRunCancelled(
              command.autonomy!.runId,
              command.autonomy!.rootDir,
            )
            return
          }

          const msg = createScheduledTaskFireMessage(
            `Running scheduled task (${formatCronFireTime(new Date())})`,
          )
          setMessages(prev => [...prev, msg])
          enqueuePendingNotification(command)
        })().catch(error =>
          logForDebugging(
            `[ScheduledTasks] failed to enqueue task ${task.id}: ${error}`,
            { level: 'error' },
          ),
        )
      },
      isLoading: () => isLoadingRef.current,
      assistantMode,
      getJitterConfig: getCronJitterConfig,
      isKilled: () => !isKairosCronEnabled(),
    })
    scheduler.start()
    return () => {
      disposed = true
      scheduler.stop()
    }
    // assistantMode is stable for the session lifetime; store/setAppState are
    // stable refs from useSyncExternalStore; setMessages is a stable useCallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistantMode])
}

function formatCronFireTime(d: Date): string {
  return d
    .toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
    .replace(/,? at |, /, ' ')
    .replace(/ ([AP]M)/, (_, ampm) => ampm.toLowerCase())
}
