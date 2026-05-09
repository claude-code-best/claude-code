import { z } from 'zod/v4'
import { logEvent } from 'src/services/analytics/index.js'
import type { AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS } from 'src/services/analytics/metadata.js'
import type { Tool } from 'src/Tool.js'
import { buildTool, type ToolDef } from 'src/Tool.js'
import { isAgentSwarmsEnabled } from 'src/utils/agentSwarmsEnabled.js'
import { lazySchema } from 'src/utils/lazySchema.js'
import { jsonStringify } from 'src/utils/slowOperations.js'
import { TEAM_LEAD_NAME } from 'src/utils/swarm/constants.js'
import {
  cleanupTeamDirectories,
  readTeamFile,
  unregisterTeamForSessionCleanup,
} from 'src/utils/swarm/teamHelpers.js'
import { clearTeammateColors } from 'src/utils/swarm/teammateLayoutManager.js'
import { clearLeaderTeamName } from 'src/utils/tasks.js'
import {
  ensureBackendsRegistered,
  getBackendByType,
  getInProcessBackend,
} from 'src/utils/swarm/backends/registry.js'
import { createPaneBackendExecutor } from 'src/utils/swarm/backends/PaneBackendExecutor.js'
import { isPaneBackend } from 'src/utils/swarm/backends/types.js'
import { sleep } from 'src/utils/sleep.js'
import { TEAM_DELETE_TOOL_NAME } from './constants.js'
import { getPrompt } from './prompt.js'
import { renderToolResultMessage, renderToolUseMessage } from './UI.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    wait_ms: z
      .number()
      .min(0)
      .max(30_000)
      .optional()
      .describe(
        'Optional time to wait for active teammates to acknowledge shutdown before cleanup.',
      ),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

export type Output = {
  success: boolean
  message: string
  team_name?: string
}

export type Input = z.infer<InputSchema>

export const TeamDeleteTool: Tool<InputSchema, Output> = buildTool({
  name: TEAM_DELETE_TOOL_NAME,
  searchHint:
    'disband delete swarm team cleanup, remove team, end team collaboration, cleanup team resources',
  maxResultSizeChars: 100_000,
  shouldDefer: true,

  userFacingName() {
    return ''
  },

  get inputSchema(): InputSchema {
    return inputSchema()
  },

  isEnabled() {
    return true
  },

  async description() {
    return 'Clean up team and task directories when the swarm is complete'
  },

  async prompt() {
    return getPrompt()
  },

  mapToolResultToToolResultBlockParam(data, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result' as const,
      content: [
        {
          type: 'text' as const,
          text: jsonStringify(data),
        },
      ],
    }
  },

  async call(input, context) {
    if (!isAgentSwarmsEnabled()) {
      throw new Error(
        'Agent Teams 功能未启用。请确保未设置 CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS_DISABLED 环境变量。',
      )
    }

    const { setAppState, getAppState } = context
    const appState = getAppState()
    const teamName = appState.teamContext?.teamName

    if (teamName) {
      // Read team config to check for active members
      const teamFile = readTeamFile(teamName)
      if (teamFile) {
        // Filter out the team lead - only count non-lead members
        const nonLeadMembers = teamFile.members.filter(
          m => m.name !== TEAM_LEAD_NAME,
        )

        // Separate truly active members from idle/dead ones
        // Members with isActive === false are idle (finished their turn or crashed)
        const activeMembers = nonLeadMembers.filter(m => m.isActive !== false)

        if (activeMembers.length > 0) {
          const requested: string[] = []
          for (const member of activeMembers) {
            let sent = false
            if (member.backendType === 'in-process') {
              const executor = getInProcessBackend()
              executor.setContext?.(context)
              sent = await executor.terminate(
                member.agentId,
                'Team cleanup requested by team lead',
              )
            } else if (
              member.backendType &&
              isPaneBackend(member.backendType)
            ) {
              await ensureBackendsRegistered()
              const executor = createPaneBackendExecutor(
                getBackendByType(member.backendType),
              )
              executor.setContext?.(context)
              sent = await executor.terminate(
                member.agentId,
                'Team cleanup requested by team lead',
              )
            }
            if (sent) {
              requested.push(member.name)
            }
          }
          const waitMs = input.wait_ms ?? 0
          if (waitMs > 0 && requested.length > 0) {
            const deadline = Date.now() + waitMs
            while (Date.now() < deadline) {
              await sleep(Math.min(250, Math.max(0, deadline - Date.now())))
              const refreshed = readTeamFile(teamName)
              const stillActive =
                refreshed?.members.filter(
                  m => m.name !== TEAM_LEAD_NAME && m.isActive !== false,
                ) ?? []
              if (stillActive.length === 0) {
                break
              }
            }
            const refreshed = readTeamFile(teamName)
            const stillActive =
              refreshed?.members.filter(
                m => m.name !== TEAM_LEAD_NAME && m.isActive !== false,
              ) ?? []
            if (stillActive.length === 0) {
              // Fall through to cleanup with the refreshed team file state.
            } else {
              const memberNames = stillActive.map(m => m.name).join(', ')
              return {
                data: {
                  success: false,
                  message: `Shutdown requested for active teammate(s): ${requested.join(', ')}. Cleanup is still blocked after waiting ${waitMs}ms: ${memberNames}.`,
                  team_name: teamName,
                },
              }
            }
          }
          const latestTeamFile = readTeamFile(teamName)
          const latestActiveMembers =
            latestTeamFile?.members.filter(
              m => m.name !== TEAM_LEAD_NAME && m.isActive !== false,
            ) ?? []
          if (latestActiveMembers.length === 0) {
            // Continue to cleanup below.
          } else {
            const memberNames = latestActiveMembers.map(m => m.name).join(', ')
            return {
              data: {
                success: false,
                message:
                  requested.length > 0
                    ? `Shutdown requested for active teammate(s): ${requested.join(', ')}. Cleanup is blocked until they exit: ${memberNames}.`
                    : `Cannot cleanup team with ${latestActiveMembers.length} active member(s): ${memberNames}. Use requestShutdown to gracefully terminate teammates first.`,
                team_name: teamName,
              },
            }
          }
        }
      }

      await cleanupTeamDirectories(teamName)
      // Already cleaned — don't try again on gracefulShutdown.
      unregisterTeamForSessionCleanup(teamName)

      // Clear color assignments so new teams start fresh
      clearTeammateColors()

      // Clear leader team name so getTaskListId() falls back to session ID
      clearLeaderTeamName()

      logEvent('tengu_team_deleted', {
        team_name:
          teamName as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
    }

    // Clear team context and inbox from app state
    setAppState(prev => ({
      ...prev,
      teamContext: undefined,
      inbox: {
        messages: [], // Clear any queued messages
      },
    }))

    return {
      data: {
        success: true,
        message: teamName
          ? `Cleaned up directories and worktrees for team "${teamName}"`
          : 'No team name found, nothing to clean up',
        team_name: teamName,
      },
    }
  },

  renderToolUseMessage,
  renderToolResultMessage,
} satisfies ToolDef<InputSchema, Output>)
