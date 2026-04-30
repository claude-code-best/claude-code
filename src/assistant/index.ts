import { readFileSync } from 'fs'
import { join } from 'path'
import { getKairosActive, getSessionId } from '../bootstrap/state.js'
import type { AppState } from '../state/AppState.js'
import { formatAgentId } from '../utils/agentId.js'
import { getCwd } from '../utils/cwd.js'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'
import { TEAM_LEAD_NAME } from '../utils/swarm/constants.js'
import {
  getTeamFilePath,
  registerTeamForSessionCleanup,
  sanitizeName,
  writeTeamFileAsync,
  type TeamFile,
} from '../utils/swarm/teamHelpers.js'
import { assignTeammateColor } from '../utils/swarm/teammateLayoutManager.js'
import {
  ensureTasksDir,
  resetTaskList,
  setLeaderTeamName,
} from '../utils/tasks.js'

let _assistantForced = false

/**
 * Whether the current session is in assistant (KAIROS) daemon mode.
 * Wraps the bootstrap kairosActive state set by main.tsx after gate check.
 */
export function isAssistantMode(): boolean {
  return getKairosActive()
}

/**
 * Mark this session as forced assistant mode (--assistant flag).
 * Skips the GrowthBook gate check — daemon is pre-entitled.
 */
export function markAssistantForced(): void {
  _assistantForced = true
}

export function isAssistantForced(): boolean {
  return _assistantForced
}

/**
 * Pre-create an in-process team so Agent(name) can spawn teammates
 * without TeamCreate.
 *
 * Creates a session-scoped assistant team file and returns a full team
 * context object matching AppState.teamContext.
 */
export async function initializeAssistantTeam(): Promise<
  AppState['teamContext']
> {
  const sessionId = getSessionId()
  const teamName = sanitizeName(`assistant-${sessionId.slice(0, 8)}`)
  const leadAgentId = formatAgentId(TEAM_LEAD_NAME, teamName)
  const teamFilePath = getTeamFilePath(teamName)
  const now = Date.now()
  const cwd = getCwd()
  const color = assignTeammateColor(leadAgentId)

  const teamFile: TeamFile = {
    name: teamName,
    description: 'Assistant mode in-process team',
    createdAt: now,
    leadAgentId,
    leadSessionId: sessionId,
    members: [
      {
        agentId: leadAgentId,
        name: TEAM_LEAD_NAME,
        agentType: 'assistant',
        color,
        joinedAt: now,
        tmuxPaneId: '',
        cwd,
        subscriptions: [],
        backendType: 'in-process',
      },
    ],
  }

  await writeTeamFileAsync(teamName, teamFile)
  registerTeamForSessionCleanup(teamName)
  await resetTaskList(teamName)
  await ensureTasksDir(teamName)
  setLeaderTeamName(teamName)

  return {
    teamName,
    teamFilePath,
    leadAgentId,
    selfAgentId: leadAgentId,
    selfAgentName: TEAM_LEAD_NAME,
    isLeader: true,
    selfAgentColor: color,
    teammates: {
      [leadAgentId]: {
        name: TEAM_LEAD_NAME,
        agentType: 'assistant',
        color,
        tmuxSessionName: 'in-process',
        tmuxPaneId: 'leader',
        cwd,
        spawnedAt: now,
      },
    },
  }
}

/**
 * Assistant-specific system prompt addendum loaded from ~/.claude/agents/assistant.md.
 * Returns empty string if the file doesn't exist.
 */
export function getAssistantSystemPromptAddendum(): string {
  try {
    return readFileSync(
      join(getClaudeConfigHomeDir(), 'agents', 'assistant.md'),
      'utf-8',
    )
  } catch {
    return ''
  }
}

/**
 * How assistant mode was activated. Used for diagnostics/analytics.
 * - 'daemon': via --assistant flag (Agent SDK daemon)
 * - 'gate': via GrowthBook gate check
 */
export function getAssistantActivationPath(): string | undefined {
  if (!isAssistantMode()) return undefined
  return _assistantForced ? 'daemon' : 'gate'
}
