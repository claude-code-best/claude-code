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
  searchHint: '解散一个群组团队并清理资源',
  maxResultSizeChars: 100_000,
  shouldDefer: true,

  userFacingName() {
    return ''
  },

  get inputSchema(): InputSchema {
    return inputSchema()
  },

  isEnabled() {
    return isAgentSwarmsEnabled()
  },

  async description() {
    return '群组完成后清理团队和任务目录'
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
    const { setAppState, getAppState } = context
    const appState = getAppState()
    const teamName = appState.teamContext?.teamName

    if (teamName) {
      // 读取团队配置以检查是否有活跃成员
      const teamFile = readTeamFile(teamName)
      if (teamFile) {
        // 过滤掉团队负责人 —— 只统计非负责人成员
        const nonLeadMembers = teamFile.members.filter(
          m => m.name !== TEAM_LEAD_NAME,
        )

        // 区分真正活跃的成员和空闲/已死的成员
        // isActive === false 的成员是空闲的（已完成轮次或已崩溃）
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
      // 已清理 —— 不要在 gracefulShutdown 时再次尝试清理
      unregisterTeamForSessionCleanup(teamName)

      // 清除颜色分配，以便新团队从全新状态开始
      clearTeammateColors()

      // 清除负责人团队名称，以便 getTaskListId() 回退到会话 ID
      clearLeaderTeamName()

      logEvent('tengu_team_deleted', {
        team_name:
          teamName as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
    }

    // 从应用状态中清除团队上下文和收件箱
    setAppState(prev => ({
      ...prev,
      teamContext: undefined,
      inbox: {
        messages: [], // 清除任何排队中的消息
      },
    }))

    return {
      data: {
        success: true,
        message: teamName
          ? `已清理团队“${teamName}”的目录和工作树`
          : '未找到团队名称，无需清理',
        team_name: teamName,
      },
    }
  },

  renderToolUseMessage,
  renderToolResultMessage,
} satisfies ToolDef<InputSchema, Output>)
