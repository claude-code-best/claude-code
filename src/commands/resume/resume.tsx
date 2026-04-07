import chalk from 'chalk'
import type { UUID } from 'crypto'
import figures from 'figures'
import * as React from 'react'
import { getOriginalCwd, getSessionId } from '../../bootstrap/state.js'
import type { CommandResultDisplay, ResumeEntrypoint } from '../../commands.js'
import { LogSelector } from '../../components/LogSelector.js'
import { MessageResponse } from '../../components/MessageResponse.js'
import { Spinner } from '../../components/Spinner.js'
import { useIsInsideModal } from '../../context/modalContext.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import { setClipboard } from '../../ink/termio/osc.js'
import { Box, Text } from '../../ink.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import type { LogOption } from '../../types/logs.js'
import { agenticSessionSearch } from '../../utils/agenticSessionSearch.js'
import { checkCrossProjectResume } from '../../utils/crossProjectResume.js'
import { getWorktreePaths } from '../../utils/getWorktreePaths.js'
import { logError } from '../../utils/log.js'
import {
  getLastSessionLog,
  getSessionIdFromLog,
  isCustomTitleEnabled,
  isLiteLog,
  loadAllProjectsMessageLogs,
  loadFullLog,
  loadSameRepoMessageLogs,
  searchSessionsByCustomTitle,
} from '../../utils/sessionStorage.js'
import { validateUuid } from '../../utils/uuid.js'

type ResumeResult =
  | { resultType: 'sessionNotFound'; arg: string }
  | { resultType: 'multipleMatches'; arg: string; count: number }

function resumeHelpMessage(result: ResumeResult): string {
  switch (result.resultType) {
    case 'sessionNotFound':
      return `Session ${chalk.bold(result.arg)} was not found.`
    case 'multipleMatches':
      return `Found ${result.count} sessions matching ${chalk.bold(result.arg)}. Please use /resume to pick a specific session.`
  }
}

function ResumeError({
  message,
  args,
  onDone,
}: {
  message: string
  args: string
  onDone: () => void
}): React.ReactNode {
  React.useEffect(() => {
    const timer = setTimeout(onDone, 0)
    return () => clearTimeout(timer)
  }, [onDone])

  return (
    <Box flexDirection="column">
      <Text dimColor>
        {figures.pointer} /resume {args}
      </Text>
      <MessageResponse>
        <Text>{message}</Text>
      </MessageResponse>
    </Box>
  )
}

function ResumeCommand({
  onDone,
  onResume,
}: {
  onDone: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void
  onResume: (
    sessionId: UUID,
    log: LogOption,
    entrypoint: ResumeEntrypoint,
  ) => Promise<void>
}): React.ReactNode {
  const [logs, setLogs] = React.useState<LogOption[]>([])
  const [worktreePaths, setWorktreePaths] = React.useState<string[]>([])
  const [loading, setLoading] = React.useState(true)
  const [resuming, setResuming] = React.useState(false)
  const [showAllProjects, setShowAllProjects] = React.useState(false)
  const { rows } = useTerminalSize()
  const insideModal = useIsInsideModal()

  const loadLogs = React.useCallback(
    async (allProjects: boolean, paths: string[]) => {
      setLoading(true)
      try {
        const allLogs = allProjects
          ? await loadAllProjectsMessageLogs()
          : await loadSameRepoMessageLogs(paths)
        const resumable = filterResumableSessions(allLogs, getSessionId())
        if (resumable.length === 0) {
          onDone('No conversations found to resume')
          return
        }
        setLogs(resumable)
      } catch (_err) {
        onDone('Failed to load conversations')
      } finally {
        setLoading(false)
      }
    },
    [onDone],
  )

  React.useEffect(() => {
    async function init() {
      const paths = await getWorktreePaths(getOriginalCwd())
      setWorktreePaths(paths)
      void loadLogs(false, paths)
    }
    void init()
  }, [loadLogs])

  const handleToggleAllProjects = React.useCallback(() => {
    const newValue = !showAllProjects
    setShowAllProjects(newValue)
    void loadLogs(newValue, worktreePaths)
  }, [showAllProjects, loadLogs, worktreePaths])

  async function handleSelect(log: LogOption) {
    const sessionId = validateUuid(getSessionIdFromLog(log))
    if (!sessionId) {
      onDone('Failed to resume conversation')
      return
    }

    // Load full messages for lite logs
    const fullLog = isLiteLog(log) ? await loadFullLog(log) : log

    // Check if this conversation is from a different directory
    const crossProjectCheck = checkCrossProjectResume(
      fullLog,
      showAllProjects,
      worktreePaths,
    )
    if (crossProjectCheck.isCrossProject) {
      if (crossProjectCheck.isSameRepoWorktree) {
        // Same repo worktree - can resume directly
        setResuming(true)
        void onResume(sessionId, fullLog, 'slash_command_picker')
        return
      }

      // Different project - show command instead of resuming
      const raw = await setClipboard(crossProjectCheck.command)
      if (raw) process.stdout.write(raw)

      // Format the output message
      const message = [
        '',
        'This conversation is from a different directory.',
        '',
        'To resume, run:',
        `  ${crossProjectCheck.command}`,
        '',
        '(Command copied to clipboard)',
        '',
      ].join('\n')

      onDone(message, { display: 'user' })
      return
    }

    // Same directory - proceed with resume
    setResuming(true)
    void onResume(sessionId, fullLog, 'slash_command_picker')
  }

  function handleCancel() {
    onDone('Resume cancelled', { display: 'system' })
  }

  if (loading) {
    return (
      <Box>
        <Spinner />
        <Text> Loading conversations…</Text>
      </Box>
    )
  }

  if (resuming) {
    return (
      <Box>
        <Spinner />
        <Text> Resuming conversation…</Text>
      </Box>
    )
  }

  return (
    <LogSelector
      logs={logs}
      maxHeight={insideModal ? Math.floor(rows / 2) : rows - 2}
      onCancel={handleCancel}
      onSelect={handleSelect}
      onLogsChanged={() => loadLogs(showAllProjects, worktreePaths)}
      showAllProjects={showAllProjects}
      onToggleAllProjects={handleToggleAllProjects}
      onAgenticSearch={agenticSessionSearch}
    />
  )
}

export function filterResumableSessions(
  logs: LogOption[],
  currentSessionId: string,
): LogOption[] {
  return logs.filter(
    l => !l.isSidechain && getSessionIdFromLog(l) !== currentSessionId,
  )
}

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  const onResume = async (
    sessionId: UUID,
    log: LogOption,
    entrypoint: ResumeEntrypoint,
  ) => {
    try {
      await context.resume?.(sessionId, log, entrypoint)
      onDone(undefined, { display: 'skip' })
    } catch (error) {
      logError(error as Error)
      onDone(`Failed to resume: ${(error as Error).message}`)
    }
  }

  const arg = args?.trim()

  // No argument provided - show picker
  if (!arg) {
    return (
      <ResumeCommand key={Date.now()} onDone={onDone} onResume={onResume} />
    )
  }

  // Load logs to search (includes same-repo worktrees)
  const worktreePaths = await getWorktreePaths(getOriginalCwd())
  const logs = await loadSameRepoMessageLogs(worktreePaths)
  if (logs.length === 0) {
    const message = 'No conversations found to resume.'
    return (
      <ResumeError
        message={message}
        args={arg}
        onDone={() => onDone(message)}
      />
    )
  }

  // First, check if arg is a valid UUID
  const maybeSessionId = validateUuid(arg)
  if (maybeSessionId) {
    const matchingLogs = logs
      .filter(l => getSessionIdFromLog(l) === maybeSessionId)
      .sort((a, b) => b.modified.getTime() - a.modified.getTime())

    if (matchingLogs.length > 0) {
      const log = matchingLogs[0]!
      const fullLog = isLiteLog(log) ? await loadFullLog(log) : log
      void onResume(maybeSessionId, fullLog, 'slash_command_session_id')
      return null
    }

    // Enriched logs didn't find it — try direct file lookup. This handles
    // sessions filtered out by enrichLogs (e.g., first message >16KB makes
    // firstPrompt extraction fail, causing the session to be dropped).
    const directLog = await getLastSessionLog(maybeSessionId)
    if (directLog) {
      void onResume(maybeSessionId, directLog, 'slash_command_session_id')
      return null
    }
  }

  // Next, try exact custom title match (only if feature is enabled)
  if (isCustomTitleEnabled()) {
    const titleMatches = await searchSessionsByCustomTitle(arg, {
      exact: true,
    })
    if (titleMatches.length === 1) {
      const log = titleMatches[0]!
      const sessionId = getSessionIdFromLog(log)
      if (sessionId) {
        const fullLog = isLiteLog(log) ? await loadFullLog(log) : log
        void onResume(sessionId, fullLog, 'slash_command_title')
        return null
      }
    }

    // Multiple matches - show error
    if (titleMatches.length > 1) {
      const message = resumeHelpMessage({
        resultType: 'multipleMatches',
        arg,
        count: titleMatches.length,
      })
      return (
        <ResumeError
          message={message}
          args={arg}
          onDone={() => onDone(message)}
        />
      )
    }
  }

  // No match found - show error
  const message = resumeHelpMessage({ resultType: 'sessionNotFound', arg })
  return (
    <ResumeError message={message} args={arg} onDone={() => onDone(message)} />
  )
}
