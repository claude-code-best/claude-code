import { feature } from 'bun:bundle'
import { APIUserAbortError } from '@anthropic-ai/sdk'
import type { CanUseToolFn } from '../../hooks/useCanUseTool.js'
import {
  getToolNameForPermissionCheck,
  mcpInfoFromString,
} from '../../services/mcp/mcpStringUtils.js'
import type { Tool, ToolPermissionContext, ToolUseContext } from '../../Tool.js'
import { AGENT_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/AgentTool/constants.js'
import { shouldUseSandbox } from '@claude-code-best/builtin-tools/tools/BashTool/shouldUseSandbox.js'
import { BASH_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/BashTool/toolName.js'
import { POWERSHELL_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/PowerShellTool/toolName.js'
import { REPL_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/REPLTool/constants.js'
import type { AssistantMessage } from '../../types/message.js'
import { extractOutputRedirections } from '../bash/commands.js'
import { logForDebugging } from '../debug.js'
import { AbortError, toError } from '../errors.js'
import { logError } from '../log.js'
import { SandboxManager } from '../sandbox/sandbox-adapter.js'
import {
  getSettingSourceDisplayNameLowercase,
  SETTING_SOURCES,
} from '../settings/constants.js'
import { plural } from '../stringUtils.js'
import { permissionModeTitle } from './PermissionMode.js'
import type {
  PermissionAskDecision,
  PermissionDecision,
  PermissionDecisionReason,
  PermissionDenyDecision,
  PermissionResult,
} from './PermissionResult.js'
import type {
  PermissionBehavior,
  PermissionRule,
  PermissionRuleSource,
  PermissionRuleValue,
} from './PermissionRule.js'
import {
  applyPermissionUpdate,
  applyPermissionUpdates,
  persistPermissionUpdates,
} from './PermissionUpdate.js'
import type {
  PermissionUpdate,
  PermissionUpdateDestination,
} from './PermissionUpdateSchema.js'
import {
  permissionRuleValueFromString,
  permissionRuleValueToString,
} from './permissionRuleParser.js'
import {
  deletePermissionRuleFromSettings,
  type PermissionRuleFromEditableSettings,
  shouldAllowManagedPermissionRulesOnly,
} from './permissionsLoader.js'

/* eslint-disable @typescript-eslint/no-require-imports */
const classifierDecisionModule = feature('TRANSCRIPT_CLASSIFIER')
  ? (require('./classifierDecision.js') as typeof import('./classifierDecision.js'))
  : null
const autoModeStateModule = feature('TRANSCRIPT_CLASSIFIER')
  ? (require('./autoModeState.js') as typeof import('./autoModeState.js'))
  : null

import {
  addToTurnClassifierDuration,
  getTotalCacheCreationInputTokens,
  getTotalCacheReadInputTokens,
  getTotalInputTokens,
  getTotalOutputTokens,
} from '../../bootstrap/state.js'
import { getFeatureValue_CACHED_WITH_REFRESH } from '../../services/analytics/growthbook.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import { sanitizeToolNameForAnalytics } from '../../services/analytics/metadata.js'
import {
  clearClassifierChecking,
  setClassifierChecking,
} from '../classifierApprovals.js'
import { isInProtectedNamespace } from '../envUtils.js'
import { executePermissionRequestHooks } from '../hooks.js'
import {
  AUTO_REJECT_MESSAGE,
  buildClassifierUnavailableMessage,
  buildYoloRejectionMessage,
  DONT_ASK_REJECT_MESSAGE,
} from '../messages.js'
import { calculateCostFromTokens } from '../modelCost.js'
/* eslint-enable @typescript-eslint/no-require-imports */
import { jsonStringify } from '../slowOperations.js'
import {
  createDenialTrackingState,
  DENIAL_LIMITS,
  type DenialTrackingState,
  recordDenial,
  recordSuccess,
  shouldFallbackToPrompting,
} from './denialTracking.js'
import {
  classifyYoloAction,
  formatActionForClassifier,
} from './yoloClassifier.js'

const CLASSIFIER_FAIL_CLOSED_REFRESH_MS = 30 * 60 * 1000 // 30分钟

const PERMISSION_RULE_SOURCES = [
  ...SETTING_SOURCES,
  'cliArg',
  'command',
  'session',
] as const satisfies readonly PermissionRuleSource[]

export function permissionRuleSourceDisplayString(
  source: PermissionRuleSource,
): string {
  return getSettingSourceDisplayNameLowercase(source)
}

export function getAllowRules(
  context: ToolPermissionContext,
): PermissionRule[] {
  return PERMISSION_RULE_SOURCES.flatMap(source =>
    (context.alwaysAllowRules[source] || []).map(ruleString => ({
      source,
      ruleBehavior: 'allow',
      ruleValue: permissionRuleValueFromString(ruleString),
    })),
  )
}

/** 创建一个解释权限请求的权限请求消息 */
export function createPermissionRequestMessage(
  toolName: string,
  decisionReason?: PermissionDecisionReason,
): string {
  // 处理不同的决策原因类型
  if (decisionReason) {
    if (
      (feature('BASH_CLASSIFIER') || feature('TRANSCRIPT_CLASSIFIER')) &&
      decisionReason.type === 'classifier'
    ) {
      return `分类器 '${decisionReason.classifier}' 要求对此 ${toolName} 命令进行审批：${decisionReason.reason}`
    }
    switch (decisionReason.type) {
      case 'hook': {
        const hookMessage = decisionReason.reason
          ? `钩子 '${decisionReason.hookName}' 阻止了此操作：${decisionReason.reason}`
          : `钩子 '${decisionReason.hookName}' 要求对此 ${toolName} 命令进行审批`
        return hookMessage
      }
      case 'rule': {
        const ruleString = permissionRuleValueToString(
          decisionReason.rule.ruleValue,
        )
        const sourceString = permissionRuleSourceDisplayString(
          decisionReason.rule.source,
        )
        return `来自 ${sourceString} 的权限规则 '${ruleString}' 要求对此 ${toolName} 命令进行审批`
      }
      case 'subcommandResults': {
        const needsApproval: string[] = []
        for (const [cmd, result] of decisionReason.reasons) {
          if (result.behavior === 'ask' || result.behavior === 'passthrough') {
            // 为显示移除输出重定向，避免将文件名显示为命令。仅对 B
            // ash 工具执行此操作，以免影响其他工具
            if (toolName === 'Bash') {
              const { commandWithoutRedirections, redirections } =
                extractOutputRedirections(cmd)
              // 仅当存在实际重定向时才使用移除后的版本
              const displayCmd =
                redirections.length > 0 ? commandWithoutRedirections : cmd
              needsApproval.push(displayCmd)
            } else {
              needsApproval.push(cmd)
            }
          }
        }
        if (needsApproval.length > 0) {
          const n = needsApproval.length
          return `此 ${toolName} 命令包含多个操作。以下 ${plural(n, 'part')} ${plural(n, 'requires', 'require')} 需要审批：${needsApproval.join(', ')}`
        }
        return `此 ${toolName} 命令包含多个需要审批的操作`
      }
      case 'permissionPromptTool':
        return `工具 '${decisionReason.permissionPromptToolName}' 要求对此 ${toolName} 命令进行审批`
      case 'sandboxOverride':
        return '在沙箱外运行'
      case 'workingDir':
        return decisionReason.reason
      case 'safetyCheck':
      case 'other':
        return decisionReason.reason
      case 'mode': {
        const modeTitle = permissionModeTitle(decisionReason.mode)
        return `当前权限模式 (${modeTitle}) 要求对此 ${toolName} 命令进行审批`
      }
      case 'asyncAgent':
        return decisionReason.reason
    }
  }

  // 默认消息，不列出允许的命令
  const message = `Claude 请求使用 ${toolName} 的权限，但您尚未授予。`

  return message
}

export function getDenyRules(context: ToolPermissionContext): PermissionRule[] {
  return PERMISSION_RULE_SOURCES.flatMap(source =>
    (context.alwaysDenyRules[source] || []).map(ruleString => ({
      source,
      ruleBehavior: 'deny',
      ruleValue: permissionRuleValueFromString(ruleString),
    })),
  )
}

export function getAskRules(context: ToolPermissionContext): PermissionRule[] {
  return PERMISSION_RULE_SOURCES.flatMap(source =>
    (context.alwaysAskRules[source] || []).map(ruleString => ({
      source,
      ruleBehavior: 'ask',
      ruleValue: permissionRuleValueFromString(ruleString),
    })),
  )
}

/** 检查整个工具是否匹配规则
例如，对于 BashTool，这匹配 "Bash" 但不匹配 "Bash(prefix:*)"
这也匹配具有服务器名称的 MCP 工具，例如规则 "mcp__server1" */
function toolMatchesRule(
  tool: Pick<Tool, 'name' | 'mcpInfo'>,
  rule: PermissionRule,
): boolean {
  // 规则必须没有内容才能匹配整个工具
  if (rule.ruleValue.ruleContent !== undefined) {
    return false
  }

  // MCP 工具通过其完全限定的 mcp__server__tool 名称进行匹配
  // 。在跳过前缀模式 (CLAUDE_AGENT_SDK_MCP_NO_PREFIX
  // ) 下，MCP 工具具有无前缀的显示名称（例如 "Write"），这些名称与内置名称
  // 冲突；针对内置工具的规则不应匹配其 MCP 替代品。
  const nameForRuleMatch = getToolNameForPermissionCheck(tool)

  // 直接工具名称匹配
  if (rule.ruleValue.toolName === nameForRuleMatch) {
    return true
  }

  // MCP 服务器级权限：规则 "mcp__server1" 匹配工具 "mcp__server1__tool
  // 1"。也支持通配符：规则 "mcp__server1__*" 匹配来自 server1 的所有工具
  const ruleInfo = mcpInfoFromString(rule.ruleValue.toolName)
  const toolInfo = mcpInfoFromString(nameForRuleMatch)

  return (
    ruleInfo !== null &&
    toolInfo !== null &&
    (ruleInfo.toolName === undefined || ruleInfo.toolName === '*') &&
    ruleInfo.serverName === toolInfo.serverName
  )
}

/** 检查整个工具是否列在始终允许规则中
例如，对于 BashTool，这找到 "Bash" 但找不到 "Bash(prefix:*)" */
export function toolAlwaysAllowedRule(
  context: ToolPermissionContext,
  tool: Pick<Tool, 'name' | 'mcpInfo'>,
): PermissionRule | null {
  return (
    getAllowRules(context).find(rule => toolMatchesRule(tool, rule)) || null
  )
}

/** 检查工具是否列在始终拒绝规则中 */
export function getDenyRuleForTool(
  context: ToolPermissionContext,
  tool: Pick<Tool, 'name' | 'mcpInfo'>,
): PermissionRule | null {
  return getDenyRules(context).find(rule => toolMatchesRule(tool, rule)) || null
}

/** 检查工具是否列在始终询问规则中 */
export function getAskRuleForTool(
  context: ToolPermissionContext,
  tool: Pick<Tool, 'name' | 'mcpInfo'>,
): PermissionRule | null {
  return getAskRules(context).find(rule => toolMatchesRule(tool, rule)) || null
}

/** 检查特定代理是否通过 Agent(agentType) 语法被拒绝。
例如，Agent(Explore) 将拒绝 Explore 代理。 */
export function getDenyRuleForAgent(
  context: ToolPermissionContext,
  agentToolName: string,
  agentType: string,
): PermissionRule | null {
  return (
    getDenyRules(context).find(
      rule =>
        rule.ruleValue.toolName === agentToolName &&
        rule.ruleValue.ruleContent === agentType,
    ) || null
  )
}

/** 过滤代理以排除那些通过 Agent(agentType) 语法被拒绝的代理。 */
export function filterDeniedAgents<T extends { agentType: string }>(
  agents: T[],
  context: ToolPermissionContext,
  agentToolName: string,
): T[] {
  // 解析拒绝规则一次，并将 Agent(x) 内容收集到一个 Set
  // 中。之前这为每个代理调用 getDenyRuleForAgent，这为每
  // 个代理重新解析每条拒绝规则（O(代理数×规则数) 次解析调用）。
  const deniedAgentTypes = new Set<string>()
  for (const rule of getDenyRules(context)) {
    if (
      rule.ruleValue.toolName === agentToolName &&
      rule.ruleValue.ruleContent !== undefined
    ) {
      deniedAgentTypes.add(rule.ruleValue.ruleContent)
    }
  }
  return agents.filter(agent => !deniedAgentTypes.has(agent.agentType))
}

/** 规则内容到给定工具关联规则的映射。
例如，对于 BashTool，字符串键是来自 "Bash(prefix:*)" 的 "prefix:*" */
export function getRuleByContentsForTool(
  context: ToolPermissionContext,
  tool: Tool,
  behavior: PermissionBehavior,
): Map<string, PermissionRule> {
  return getRuleByContentsForToolName(
    context,
    getToolNameForPermissionCheck(tool),
    behavior,
  )
}

// 用于打破工具调用此函数时产生的循环依赖。
export function getRuleByContentsForToolName(
  context: ToolPermissionContext,
  toolName: string,
  behavior: PermissionBehavior,
): Map<string, PermissionRule> {
  const ruleByContents = new Map<string, PermissionRule>()
  let rules: PermissionRule[] = []
  switch (behavior) {
    case 'allow':
      rules = getAllowRules(context)
      break
    case 'deny':
      rules = getDenyRules(context)
      break
    case 'ask':
      rules = getAskRules(context)
      break
  }
  for (const rule of rules) {
    if (
      rule.ruleValue.toolName === toolName &&
      rule.ruleValue.ruleContent !== undefined &&
      rule.ruleBehavior === behavior
    ) {
      ruleByContents.set(rule.ruleValue.ruleContent, rule)
    }
  }
  return ruleByContents
}

/** 为无法显示权限提示的无头/异步代理运行 PermissionRequest 钩子。这给了钩子在备用自动拒绝机制生效前，允许或拒绝工具使用的机会。

如果钩子做出了决定，则返回一个 PermissionDecision；如果没有钩子提供决定（调用方应继续执行自动拒绝），则返回 null。 */
async function runPermissionRequestHooksForHeadlessAgent(
  tool: Tool,
  input: { [key: string]: unknown },
  toolUseID: string,
  context: ToolUseContext,
  permissionMode: string | undefined,
  suggestions: PermissionUpdate[] | undefined,
): Promise<PermissionDecision | null> {
  try {
    for await (const hookResult of executePermissionRequestHooks(
      tool.name,
      toolUseID,
      input,
      context,
      permissionMode,
      suggestions as any,
      context.abortController.signal,
    )) {
      if (!hookResult.permissionRequestResult) {
        continue
      }
      const decision = hookResult.permissionRequestResult
      if (decision.behavior === 'allow') {
        const finalInput = decision.updatedInput ?? input
        // 如果提供了权限更新，则将其持久化。
        if (decision.updatedPermissions?.length) {
          persistPermissionUpdates(decision.updatedPermissions as any)
          context.setAppState(prev => ({
            ...prev,
            toolPermissionContext: applyPermissionUpdates(
              prev.toolPermissionContext,
              decision.updatedPermissions as any,
            ),
          }))
        }
        return {
          behavior: 'allow',
          updatedInput: finalInput,
          decisionReason: {
            type: 'hook',
            hookName: 'PermissionRequest',
          },
        }
      }
      if (decision.behavior === 'deny') {
        if (decision.interrupt) {
          logForDebugging(
            `钩子中断：tool=${tool.name} hookMessage=${decision.message}`,
          )
          context.abortController.abort()
        }
        return {
          behavior: 'deny',
          message: decision.message || '权限被钩子拒绝',
          decisionReason: {
            type: 'hook',
            hookName: 'PermissionRequest',
            reason: decision.message,
          },
        }
      }
    }
  } catch (error) {
    // 如果钩子失败，则回退到自动拒绝，而不是导致崩溃。
    logError(
      new Error('无头代理的 PermissionRequest 钩子失败', {
        cause: toError(error),
      }),
    )
  }
  return null
}

export const hasPermissionsToUseTool: CanUseToolFn = async (
  tool,
  input,
  context,
  assistantMessage,
  toolUseID,
): Promise<PermissionDecision> => {
  const result = await hasPermissionsToUseToolInner(tool, input, context)

  // Reset consecutive denials on any allowed tool use in auto mode.
  // This ensures that a successful tool use (even one auto-allowed by rules)
  // breaks the consecutive denial streak.
  if (result.behavior === 'allow') {
    const appState = context.getAppState()
    if (feature('TRANSCRIPT_CLASSIFIER')) {
      const currentDenialState =
        context.localDenialTracking ?? appState.denialTracking
      if (
        appState.toolPermissionContext.mode === 'auto' &&
        currentDenialState &&
        currentDenialState.consecutiveDenials > 0
      ) {
        const newDenialState = recordSuccess(currentDenialState)
        persistDenialState(context, newDenialState)
      }
    }
    return result
  }

  // 应用 dontAsk 模式转换：将 'ask' 转换
  // 为 'deny'。此操作在最后执行，以防止被提前返回绕过。
  if (result.behavior === 'ask') {
    const appState = context.getAppState()

    if (appState.toolPermissionContext.mode === 'dontAsk') {
      return {
        behavior: 'deny',
        decisionReason: {
          type: 'mode',
          mode: 'dontAsk',
        },
        message: DONT_ASK_REJECT_MESSAGE(tool.name),
      }
    }
    // 应用自动模式：使用 AI 分类器而不是提示用户。在 should
    // AvoidPermissionPrompts 之前检查此项，以便分类器在无头模式下工作。
    if (
      feature('TRANSCRIPT_CLASSIFIER') &&
      (appState.toolPermissionContext.mode === 'auto' ||
        (appState.toolPermissionContext.mode === 'plan' &&
          (autoModeStateModule?.isAutoModeActive() ?? false)))
    ) {
      // 非分类器可批准的安全检查决定对所有自动批准路径保持免疫：
      // acceptEdits 快速路径、安全工具白名单和分类器。步
      // 骤 1g 仅防护 bypassPermissions；此项防
      // 护自动模式。分类器可批准的安全检查（敏感文件路径）会传递给
      // 分类器——下面的快速路径自然不会被触发，因为工具自身的 ch
      // eckPermissions 仍然返回 'ask'。
      if (
        result.decisionReason?.type === 'safetyCheck' &&
        !result.decisionReason.classifierApprovable
      ) {
        if (appState.toolPermissionContext.shouldAvoidPermissionPrompts) {
          return {
            behavior: 'deny',
            message: result.message,
            decisionReason: {
              type: 'asyncAgent',
              reason:
                '安全检查需要交互式批准，但在此上下文中无法提供权限提示。',
            },
          }
        }
        return result
      }
      if (tool.requiresUserInteraction?.() && result.behavior === 'ask') {
        return result
      }

      // 对异步子代理使用本地拒绝跟踪（其 setAppState 是空
      // 操作），否则像以前一样从 appState 读取。
      const denialState =
        context.localDenialTracking ??
        appState.denialTracking ??
        createDenialTrackingState()

      // 在自动模式下，PowerShell 需要明确的用户权限，除非 POWERS
      // HELL_AUTO_MODE（仅限蚂蚁构建标志）已开启。禁用时，此防护使 PS
      // 不进入分类器，并跳过下面的 acceptEdits 快速路径。启用时，P
      // S 像 Bash 一样进入分类器——分类器提示会附加 POWERSHELL_DE
      // NY_GUIDANCE，以便其识别 `iex (iwr ...)` 为下载并执行
      // 等。注意：此操作在 behavior === 'ask' 分支内运行
      // ，因此较早触发的允许规则（步骤 2b 的 toolAlwaysAllowedR
      // ule、PS 前缀允许）会在到达此处之前返回。允许规则的保护由 permis
      // sionSetup.ts 处理：isOverlyBroadPowerShe
      // llAllowRule 会剥离 PowerShell(*)，而 isDangerou
      // sPowerShellPermission 会为蚂蚁用户和自动模式入口剥离
      // iex/pwsh/Start-Process 前缀规则。
      if (
        tool.name === POWERSHELL_TOOL_NAME &&
        !feature('POWERSHELL_AUTO_MODE')
      ) {
        if (appState.toolPermissionContext.shouldAvoidPermissionPrompts) {
          return {
            behavior: 'deny',
            message: 'PowerShell 工具需要交互式批准。',
            decisionReason: {
              type: 'asyncAgent',
              reason:
                'PowerShell 工具需要交互式批准，但在此上下文中无法提供权限提示。',
            },
          }
        }
        logForDebugging(
          `跳过 ${tool.name} 的自动模式分类器：工具需要明确的用户权限。`,
        )
        return result
      }

      // 在运行自动模式分类器之前，检查 acceptEdits 模式是否会允
      // 许此操作。这避免了为安全操作（如工作目录中的文件编辑）进行昂贵的分
      // 类器 API 调用。对 Agent 和 REPL
      // 跳过此检查——它们的 checkPermissions 在 acc
      // eptEdits 模式下返回 'allow'，这会静默绕过分类器
      // 。REPL 代码可能在内部工具调用之间包含虚拟机逃逸；分类器必须看
      // 到粘合的 JavaScript，而不仅仅是内部工具调用。
      if (
        result.behavior === 'ask' &&
        tool.name !== AGENT_TOOL_NAME &&
        tool.name !== REPL_TOOL_NAME
      ) {
        try {
          const parsedInput = tool.inputSchema.parse(input)
          const acceptEditsResult = await tool.checkPermissions(parsedInput, {
            ...context,
            getAppState: () => {
              const state = context.getAppState()
              return {
                ...state,
                toolPermissionContext: {
                  ...state.toolPermissionContext,
                  mode: 'acceptEdits' as const,
                },
              }
            },
          })
          if (acceptEditsResult.behavior === 'allow') {
            const newDenialState = recordSuccess(denialState)
            persistDenialState(context, newDenialState)
            logForDebugging(
              `跳过 ${tool.name} 的自动模式分类器：在 acceptEdits 模式下会被允许。`,
            )
            logEvent('tengu_auto_mode_decision', {
              decision:
                'allowed' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              toolName: sanitizeToolNameForAnalytics(tool.name),
              inProtectedNamespace: isInProtectedNamespace(),
              // 产生此 tool_use 的代理完成的
              // msg_id——分类器记录底部的操作。将
              // 决策关联回主代理的 API 响应。
              agentMsgId: assistantMessage.message
                .id as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              confidence:
                'high' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              fastPath:
                'acceptEdits' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
            })
            return {
              behavior: 'allow',
              updatedInput: acceptEditsResult.updatedInput ?? input,
              decisionReason: {
                type: 'mode',
                mode: 'auto',
              },
            }
          }
        } catch (e) {
          if (e instanceof AbortError || e instanceof APIUserAbortError) {
            throw e
          }
          // 如果 acceptEdits 检查失败，则回退到分类器。
        }
      }

      // 白名单工具是安全的，不需要 YOLO 分类。这
      // 使用安全工具白名单来跳过不必要的分类器 API 调用。
      if (classifierDecisionModule!.isAutoModeAllowlistedTool(tool.name)) {
        const newDenialState = recordSuccess(denialState)
        persistDenialState(context, newDenialState)
        logForDebugging(
          `跳过 ${tool.name} 的自动模式分类器：工具位于安全白名单上。`,
        )
        logEvent('tengu_auto_mode_decision', {
          decision:
            'allowed' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          toolName: sanitizeToolNameForAnalytics(tool.name),
          inProtectedNamespace: isInProtectedNamespace(),
          agentMsgId: assistantMessage.message
            .id as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          confidence:
            'high' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          fastPath:
            'allowlist' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })
        return {
          behavior: 'allow',
          updatedInput: input,
          decisionReason: {
            type: 'mode',
            mode: 'auto',
          },
        }
      }

      // 运行自动模式分类器。
      const action = formatActionForClassifier(tool.name, input)
      setClassifierChecking(toolUseID)
      let classifierResult
      try {
        logForDebugging(
          `[auto-mode] classifyYoloAction called with langfuseTrace=${context.langfuseTrace ? `id=${(context.langfuseTrace as unknown as Record<string, unknown>).id ?? 'present'}` : 'null/undefined'}`,
        )
        classifierResult = await classifyYoloAction(
          context.messages,
          action,
          context.options.tools,
          appState.toolPermissionContext,
          context.abortController.signal,
          context.langfuseRootTrace ?? context.langfuseTrace,
        )
      } finally {
        clearClassifierChecking(toolUseID)
      }

      // 当分类器错误转储提示时通知蚂蚁（将位于 /share 中）。
      if (
        process.env.USER_TYPE === 'ant' &&
        classifierResult.errorDumpPath &&
        context.addNotification
      ) {
        context.addNotification({
          key: 'auto-mode-error-dump',
          text: `自动模式分类器错误——提示已转储到 ${classifierResult.errorDumpPath}（包含在 /share 中）。`,
          priority: 'immediate',
          color: 'error',
        })
      }

      // 记录分类器决策以用于指标（包括开销遥测）。
      const yoloDecision = classifierResult.unavailable
        ? 'unavailable'
        : classifierResult.shouldBlock
          ? 'blocked'
          : 'allowed'

      // 计算分类器成本（美元）以进行开销分析。
      const classifierCostUSD =
        classifierResult.usage && classifierResult.model
          ? calculateCostFromTokens(
              classifierResult.model,
              classifierResult.usage,
            )
          : undefined
      logEvent('tengu_auto_mode_decision', {
        decision:
          yoloDecision as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        toolName: sanitizeToolNameForAnalytics(tool.name),
        inProtectedNamespace: isInProtectedNamespace(),
        // 产生此 tool_use 的代理完成的 m
        // sg_id——分类器记录底部的操作。
        agentMsgId: assistantMessage.message
          .id as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        classifierModel:
          classifierResult.model as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        consecutiveDenials: classifierResult.shouldBlock
          ? denialState.consecutiveDenials + 1
          : 0,
        totalDenials: classifierResult.shouldBlock
          ? denialState.totalDenials + 1
          : denialState.totalDenials,
        // 开销遥测：分类器 API 调用的令牌使用情况和延迟。
        classifierInputTokens: classifierResult.usage?.inputTokens,
        classifierOutputTokens: classifierResult.usage?.outputTokens,
        classifierCacheReadInputTokens:
          classifierResult.usage?.cacheReadInputTokens,
        classifierCacheCreationInputTokens:
          classifierResult.usage?.cacheCreationInputTokens,
        classifierDurationMs: classifierResult.durationMs,
        // 发送给分类器的提示组件的字符长度
        classifierSystemPromptLength:
          classifierResult.promptLengths?.systemPrompt,
        classifierToolCallsLength: classifierResult.promptLengths?.toolCalls,
        classifierUserPromptsLength:
          classifierResult.promptLengths?.userPrompts,
        // 分类器调用时的会话总计（用于计算开销百分比）。这些仅为主转录
        // 本——sideQuery（由分类器使用）不会调用 addT
        // oTotalSessionCost，因此分类器令牌被排除在外。
        sessionInputTokens: getTotalInputTokens(),
        sessionOutputTokens: getTotalOutputTokens(),
        sessionCacheReadInputTokens: getTotalCacheReadInputTokens(),
        sessionCacheCreationInputTokens: getTotalCacheCreationInputTokens(),
        classifierCostUSD,
        classifierStage:
          classifierResult.stage as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        classifierStage1InputTokens: classifierResult.stage1Usage?.inputTokens,
        classifierStage1OutputTokens:
          classifierResult.stage1Usage?.outputTokens,
        classifierStage1CacheReadInputTokens:
          classifierResult.stage1Usage?.cacheReadInputTokens,
        classifierStage1CacheCreationInputTokens:
          classifierResult.stage1Usage?.cacheCreationInputTokens,
        classifierStage1DurationMs: classifierResult.stage1DurationMs,
        classifierStage1RequestId:
          classifierResult.stage1RequestId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        classifierStage1MsgId:
          classifierResult.stage1MsgId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        classifierStage1CostUSD:
          classifierResult.stage1Usage && classifierResult.model
            ? calculateCostFromTokens(
                classifierResult.model,
                classifierResult.stage1Usage,
              )
            : undefined,
        classifierStage2InputTokens: classifierResult.stage2Usage?.inputTokens,
        classifierStage2OutputTokens:
          classifierResult.stage2Usage?.outputTokens,
        classifierStage2CacheReadInputTokens:
          classifierResult.stage2Usage?.cacheReadInputTokens,
        classifierStage2CacheCreationInputTokens:
          classifierResult.stage2Usage?.cacheCreationInputTokens,
        classifierStage2DurationMs: classifierResult.stage2DurationMs,
        classifierStage2RequestId:
          classifierResult.stage2RequestId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        classifierStage2MsgId:
          classifierResult.stage2MsgId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        classifierStage2CostUSD:
          classifierResult.stage2Usage && classifierResult.model
            ? calculateCostFromTokens(
                classifierResult.model,
                classifierResult.stage2Usage,
              )
            : undefined,
      })

      if (classifierResult.durationMs !== undefined) {
        addToTurnClassifierDuration(classifierResult.durationMs)
      }

      if (classifierResult.shouldBlock) {
        // 转录本超出了分类器的上下文窗口——确定性错误，重
        // 试不会恢复。跳过 iron_gate 并回退
        // 到正常提示，以便用户可以手动批准/拒绝。
        if (classifierResult.transcriptTooLong) {
          if (appState.toolPermissionContext.shouldAvoidPermissionPrompts) {
            // 永久性状态（转录本只会增长）——拒绝-重试-拒
            // 绝会浪费令牌，而永远不会触发拒绝限制中止。
            throw new AbortError(
              '代理已中止：无头模式下自动模式分类器转录本超出上下文窗口',
            )
          }
          logForDebugging('自动模式分类器转录本过长，回退到正常权限处理', {
            level: 'warn',
          })
          return {
            ...result,
            decisionReason: {
              type: 'other',
              reason: '自动模式分类器转录本超出上下文窗口——回退到手动批准',
            },
          }
        }
        // 当分类器不可用时（API 错误），行为取决于 tengu_iro
        // n_gate_closed 门控。
        if (classifierResult.unavailable) {
          if (
            getFeatureValue_CACHED_WITH_REFRESH(
              'tengu_iron_gate_closed',
              true,
              CLASSIFIER_FAIL_CLOSED_REFRESH_MS,
            )
          ) {
            if (appState.toolPermissionContext.shouldAvoidPermissionPrompts) {
              logForDebugging(
                '自动模式分类器不可用，拒绝并附带重试指引（故障关闭）',
                { level: 'warn' },
              )
              return {
                behavior: 'deny',
                decisionReason: {
                  type: 'classifier',
                  classifier: 'auto-mode',
                  reason: 'Classifier unavailable',
                },
                message: buildClassifierUnavailableMessage(
                  tool.name,
                  classifierResult.model,
                ),
              }
            }
            logForDebugging(
              'Auto mode classifier unavailable, falling back to prompting with retry guidance (fail closed)',
              { level: 'warn' },
            )
            return {
              behavior: 'ask',
              decisionReason: {
                type: 'classifier',
                classifier: 'auto-mode',
                reason: '分类器不可用',
              },
              message: buildClassifierUnavailableMessage(
                tool.name,
                classifierResult.model,
              ),
            }
          }
          // 故障开放：回退到正常权限处理
          logForDebugging(
            '自动模式分类器不可用，回退到正常权限处理（故障开放）',
            { level: 'warn' },
          )
          return result
        }

        // 更新拒绝跟踪并检查限制
        const newDenialState = recordDenial(denialState)
        persistDenialState(context, newDenialState)

        logForDebugging(
          `自动模式分类器阻止了操作：${classifierResult.reason}`,
          { level: 'warn' },
        )

        // 如果达到拒绝限制，则回退到提示，以便用户
        // 可以审查。我们在分类器之后检查，以便可以在
        // 提示中包含其理由。
        const denialLimitResult = handleDenialLimitExceeded(
          newDenialState,
          appState,
          classifierResult.reason,
          assistantMessage,
          tool,
          result,
          context,
        )
        if (denialLimitResult) {
          return denialLimitResult
        }

        return {
          behavior: 'deny',
          decisionReason: {
            type: 'classifier',
            classifier: 'auto-mode',
            reason: classifierResult.reason,
          },
          message: buildYoloRejectionMessage(classifierResult.reason),
        }
      }

      // 成功时重置连续拒绝次数
      const newDenialState = recordSuccess(denialState)
      persistDenialState(context, newDenialState)

      return {
        behavior: 'allow',
        updatedInput: input,
        decisionReason: {
          type: 'classifier',
          classifier: 'auto-mode',
          reason: classifierResult.reason,
        },
      }
    }

    // 当应避免权限提示时（例如，后台/无头代理），首先运行 Perm
    // issionRequest 钩子，给它们允许/拒绝的机会
    // 。仅当没有钩子提供决定时才自动拒绝。
    if (appState.toolPermissionContext.shouldAvoidPermissionPrompts) {
      const hookDecision = await runPermissionRequestHooksForHeadlessAgent(
        tool,
        input,
        toolUseID,
        context,
        appState.toolPermissionContext.mode,
        result.suggestions,
      )
      if (hookDecision) {
        return hookDecision
      }
      return {
        behavior: 'deny',
        decisionReason: {
          type: 'asyncAgent',
          reason: '在此上下文中权限提示不可用',
        },
        message: AUTO_REJECT_MESSAGE(tool.name),
      }
    }
  }

  return result
}

/** 持久化拒绝跟踪状态。对于具有 localDenialTracking 的异步子代理，
就地修改本地状态（因为 setAppState 是无操作的）。否则，
照常写入 appState。 */
function persistDenialState(
  context: ToolUseContext,
  newState: DenialTrackingState,
): void {
  if (context.localDenialTracking) {
    Object.assign(context.localDenialTracking, newState)
  } else {
    context.setAppState(prev => {
      // 当状态未改变时，recordSuccess 返回相同的引用
      // 。此处返回 prev 可以让 store.setState 的 Objec
      // t.is 检查完全跳过监听器循环。
      if (prev.denialTracking === newState) return prev
      return { ...prev, denialTracking: newState }
    })
  }
}

/** 检查是否超出拒绝限制并返回一个‘询问’结果，
以便用户可以审查。如果未达到任何限制，则返回 null。 */
function handleDenialLimitExceeded(
  denialState: DenialTrackingState,
  appState: {
    toolPermissionContext: { shouldAvoidPermissionPrompts?: boolean }
  },
  classifierReason: string,
  assistantMessage: AssistantMessage,
  tool: Tool,
  result: PermissionDecision,
  context: ToolUseContext,
): PermissionDecision | null {
  if (!shouldFallbackToPrompting(denialState)) {
    return null
  }

  const hitTotalLimit = denialState.totalDenials >= DENIAL_LIMITS.maxTotal
  const isHeadless = appState.toolPermissionContext.shouldAvoidPermissionPrompts
  // 在 persistDenialState 之前捕获计数，persistDenialState 可能会通过 Objec
  // t.assign 为具有 localDenialTracking 的子代理就地修改 denialState。
  const totalCount = denialState.totalDenials
  const consecutiveCount = denialState.consecutiveDenials
  const warning = hitTotalLimit
    ? `本次会话中已阻止 ${totalCount} 个操作。请在继续之前审查转录本。`
    : `已连续阻止 ${consecutiveCount} 个操作。请在继续之前审查转录本。`

  logEvent('tengu_auto_mode_denial_limit_exceeded', {
    limit: (hitTotalLimit
      ? 'total'
      : 'consecutive') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    mode: (isHeadless
      ? 'headless'
      : 'cli') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    messageID: assistantMessage.message
      .id as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    consecutiveDenials: consecutiveCount,
    totalDenials: totalCount,
    toolName: sanitizeToolNameForAnalytics(tool.name),
  })

  if (isHeadless) {
    throw new AbortError('代理已中止：无头模式下分类器拒绝次数过多')
  }

  logForDebugging(`分类器拒绝限制已超出，回退到提示：${warning}`, {
    level: 'warn',
  })

  if (hitTotalLimit) {
    persistDenialState(context, {
      ...denialState,
      totalDenials: 0,
      consecutiveDenials: 0,
    })
  }

  // 保留原始分类器值（例如 'dangerous-agent-action'
  // ），以便 interactiveHandler 中的下游分析可以记录
  // 正确的用户覆盖事件。
  const originalClassifier =
    result.decisionReason?.type === 'classifier'
      ? result.decisionReason.classifier
      : 'auto-mode'

  return {
    ...result,
    decisionReason: {
      type: 'classifier',
      classifier: originalClassifier,
      reason: `${warning}

最近被阻止的操作：${classifierReason}`,
    },
  }
}

/** 仅检查权限管道的基于规则的步骤——即 bypassPermissions 模式所尊重的子集（在步骤 2a 之前触发的所有内容）。

如果规则阻止了工具，则返回拒绝/询问决定；如果没有规则对象，则返回 null。与 hasPermissionsToUseTool 不同，此函数不运行自动模式分类器、基于模式的转换（dontAsk/auto/asyncAgent）、PermissionRequest 钩子，
也不检查 bypassPermissions / always-allowed。

调用者必须预先检查 tool.requiresUserInteraction()——不复制步骤 1e。 */
export async function checkRuleBasedPermissions(
  tool: Tool,
  input: { [key: string]: unknown },
  context: ToolUseContext,
): Promise<PermissionAskDecision | PermissionDenyDecision | null> {
  const appState = context.getAppState()

  // 1a. 整个工具被规则拒绝
  const denyRule = getDenyRuleForTool(appState.toolPermissionContext, tool)
  if (denyRule) {
    return {
      behavior: 'deny',
      decisionReason: {
        type: 'rule',
        rule: denyRule,
      },
      message: `使用 ${tool.name} 的权限已被拒绝。`,
    }
  }

  // 1b. 整个工具有一条询问规则
  const askRule = getAskRuleForTool(appState.toolPermissionContext, tool)
  if (askRule) {
    const canSandboxAutoAllow =
      tool.name === BASH_TOOL_NAME &&
      SandboxManager.isSandboxingEnabled() &&
      SandboxManager.isAutoAllowBashIfSandboxedEnabled() &&
      shouldUseSandbox(input)

    if (!canSandboxAutoAllow) {
      return {
        behavior: 'ask',
        decisionReason: {
          type: 'rule',
          rule: askRule,
        },
        message: createPermissionRequestMessage(tool.name),
      }
    }
    // 向下传递，让 tool.checkPermissions 处理特定于命令的规则
  }

  // 1c. 特定于工具的权限检查（例如 bash 子命令规则）
  let toolPermissionResult: PermissionResult = {
    behavior: 'passthrough',
    message: createPermissionRequestMessage(tool.name),
  }
  try {
    const parsedInput = tool.inputSchema.parse(input)
    toolPermissionResult = await tool.checkPermissions(parsedInput, context)
  } catch (e) {
    if (e instanceof AbortError || e instanceof APIUserAbortError) {
      throw e
    }
    logError(e)
  }

  // 1d. 工具实现拒绝了权限（捕获包裹在 subcommandResults 中的 b
  // ash 子命令拒绝 —— 无需检查 decisionReason.type）
  if (toolPermissionResult?.behavior === 'deny') {
    return toolPermissionResult
  }

  // 1f. 来自 tool.checkPermissions 的特定于内容的询问规则（例如 Bash
  // (npm publish:*) → {ask, type:'rule', ruleBehavior:'ask'}）
  if (
    toolPermissionResult?.behavior === 'ask' &&
    toolPermissionResult.decisionReason?.type === 'rule' &&
    toolPermissionResult.decisionReason.rule.ruleBehavior === 'ask'
  ) {
    return toolPermissionResult
  }

  // 1g. 安全检查（例如 .git/、.claude/、.vscode/、shell 配置文件）是
  // 绕过免疫的 —— 即使 PreToolUse 钩子返回了允许，它们也必须触发提示。checkPa
  // thSafetyForAutoEdit 会为这些路径返回 {type:'safetyCheck'}。
  if (
    toolPermissionResult?.behavior === 'ask' &&
    toolPermissionResult.decisionReason?.type === 'safetyCheck'
  ) {
    return toolPermissionResult
  }

  // 没有基于规则的反对意见
  return null
}

async function hasPermissionsToUseToolInner(
  tool: Tool,
  input: { [key: string]: unknown },
  context: ToolUseContext,
): Promise<PermissionDecision> {
  if (context.abortController.signal.aborted) {
    throw new AbortError()
  }

  let appState = context.getAppState()

  // 1. 检查工具是否被拒绝
  // 1a. 整个工具被拒绝
  const denyRule = getDenyRuleForTool(appState.toolPermissionContext, tool)
  if (denyRule) {
    return {
      behavior: 'deny',
      decisionReason: {
        type: 'rule',
        rule: denyRule,
      },
      message: `使用 ${tool.name} 的权限已被拒绝。`,
    }
  }

  // 1b. 检查整个工具是否应始终请求权限
  const askRule = getAskRuleForTool(appState.toolPermissionContext, tool)
  if (askRule) {
    // 当 autoAllowBashIfSandboxed 开启时，沙盒化的命令会跳过询问规
    // 则并通过 Bash 的 checkPermissions 自动允许。不会被沙盒化的命令（排
    // 除的命令、dangerouslyDisableSandbox）仍需遵守询问规则。
    const canSandboxAutoAllow =
      tool.name === BASH_TOOL_NAME &&
      SandboxManager.isSandboxingEnabled() &&
      SandboxManager.isAutoAllowBashIfSandboxedEnabled() &&
      shouldUseSandbox(input)

    if (!canSandboxAutoAllow) {
      return {
        behavior: 'ask',
        decisionReason: {
          type: 'rule',
          rule: askRule,
        },
        message: createPermissionRequestMessage(tool.name),
      }
    }
    // 向下传递，让 Bash 的 checkPermissions 处理特定于命令的规则
  }

  // 1c. 向工具实现请求权限结果（除非
  // 工具输入模式无效，否则会被覆盖）
  let toolPermissionResult: PermissionResult = {
    behavior: 'passthrough',
    message: createPermissionRequestMessage(tool.name),
  }
  try {
    const parsedInput = tool.inputSchema.parse(input)
    toolPermissionResult = await tool.checkPermissions(parsedInput, context)
  } catch (e) {
    // 重新抛出中止错误，以便它们正确传播
    if (e instanceof AbortError || e instanceof APIUserAbortError) {
      throw e
    }
    logError(e)
  }

  // 1d. 工具实现拒绝了权限
  if (toolPermissionResult?.behavior === 'deny') {
    return toolPermissionResult
  }

  // 1e. 即使在绕过模式下，工具也需要用户交互
  if (
    tool.requiresUserInteraction?.() &&
    toolPermissionResult?.behavior === 'ask'
  ) {
    return toolPermissionResult
  }

  // 1f. 来自 tool.checkPermissions 的特定于内容的询问规则优先于 by
  // passPermissions 模式。当用户显式配置了特定于内容的询问规则（例如
  // Bash(npm publish:*)）时，工具的 checkPermissi
  // ons 会返回 {behavior:'ask', decisionReason:{typ
  // e:'rule', rule:{ruleBehavior:'ask'}}}。即使在绕过模式
  // 下也必须遵守此规则，就像在步骤 1d 中遵守拒绝规则一样。
  if (
    toolPermissionResult?.behavior === 'ask' &&
    toolPermissionResult.decisionReason?.type === 'rule' &&
    toolPermissionResult.decisionReason.rule.ruleBehavior === 'ask'
  ) {
    return toolPermissionResult
  }

  // 1g. 安全检查（例如 .git/、.claude/、.vscode/、shell 配置文件）是绕
  // 过免疫的 —— 即使在 bypassPermissions 模式下也必须触发提示。check
  // PathSafetyForAutoEdit 会为这些路径返回 {type:'safetyCheck'}。
  if (
    toolPermissionResult?.behavior === 'ask' &&
    toolPermissionResult.decisionReason?.type === 'safetyCheck'
  ) {
    return toolPermissionResult
  }

  // 2a. 检查模式是否允许工具运行（重要
  // ：调用 getAppState() 以获取最新值）
  appState = context.getAppState()
  // 检查是否应绕过权限：- 直接 bypassP
  // ermissions 模式 - 当
  // 用户最初以绕过模式启动时的计划模式（isBypassPermissionsModeAvailable）
  const shouldBypassPermissions =
    appState.toolPermissionContext.mode === 'bypassPermissions' ||
    (appState.toolPermissionContext.mode === 'plan' &&
      appState.toolPermissionContext.isBypassPermissionsModeAvailable)
  if (shouldBypassPermissions) {
    return {
      behavior: 'allow',
      updatedInput: getUpdatedInputOrFallback(toolPermissionResult, input),
      decisionReason: {
        type: 'mode',
        mode: appState.toolPermissionContext.mode,
      },
    }
  }

  // 2b. 整个工具被允许
  const alwaysAllowedRule = toolAlwaysAllowedRule(
    appState.toolPermissionContext,
    tool,
  )
  if (alwaysAllowedRule) {
    return {
      behavior: 'allow',
      updatedInput: getUpdatedInputOrFallback(toolPermissionResult, input),
      decisionReason: {
        type: 'rule',
        rule: alwaysAllowedRule,
      },
    }
  }

  // 3. 将 "passthrough" 转换为 "ask"
  const result: PermissionDecision =
    toolPermissionResult.behavior === 'passthrough'
      ? {
          ...toolPermissionResult,
          behavior: 'ask' as const,
          message: createPermissionRequestMessage(
            tool.name,
            toolPermissionResult.decisionReason,
          ),
        }
      : toolPermissionResult

  if (result.behavior === 'ask' && result.suggestions) {
    logForDebugging(
      `${tool.name} 的权限建议：${jsonStringify(result.suggestions, null, 2)}`,
    )
  }

  return result
}

type EditPermissionRuleArgs = {
  initialContext: ToolPermissionContext
  setToolPermissionContext: (updatedContext: ToolPermissionContext) => void
}

/** 从相应目标删除权限规则 */
export async function deletePermissionRule({
  rule,
  initialContext,
  setToolPermissionContext,
}: EditPermissionRuleArgs & { rule: PermissionRule }): Promise<void> {
  if (
    rule.source === 'policySettings' ||
    rule.source === 'flagSettings' ||
    rule.source === 'command'
  ) {
    throw new Error('无法从只读设置中删除权限规则')
  }

  const updatedContext = applyPermissionUpdate(initialContext, {
    type: 'removeRules',
    rules: [rule.ruleValue],
    behavior: rule.ruleBehavior,
    destination: rule.source as PermissionUpdateDestination,
  })

  // 从设置中删除规则的按目标逻辑
  const destination = rule.source
  switch (destination) {
    case 'localSettings':
    case 'userSettings':
    case 'projectSettings': {
      // 注意：即使我们根据 `rule.source` 进行切换，Typescript 也不知道规则符合 `PermissionRuleFromEditableSettings`
      deletePermissionRuleFromSettings(
        rule as PermissionRuleFromEditableSettings,
      )
      break
    }
    case 'cliArg':
    case 'session': {
      // 对于内存中的源无需操作 —— 不会持久化到磁盘
      break
    }
  }

  // 使用更新后的上下文更新 React 状态
  setToolPermissionContext(updatedContext)
}

/** 将 PermissionRule 数组转换为 PermissionUpdate 数组的辅助函数 */
function convertRulesToUpdates(
  rules: PermissionRule[],
  updateType: 'addRules' | 'replaceRules',
): PermissionUpdate[] {
  // 按来源和行为对规则进行分组
  const grouped = new Map<string, PermissionRuleValue[]>()

  for (const rule of rules) {
    const key = `${rule.source}:${rule.ruleBehavior}`
    if (!grouped.has(key)) {
      grouped.set(key, [])
    }
    grouped.get(key)!.push(rule.ruleValue)
  }

  // 转换为 PermissionUpdate 数组
  const updates: PermissionUpdate[] = []
  for (const [key, ruleValues] of grouped) {
    const [source, behavior] = key.split(':')
    updates.push({
      type: updateType,
      rules: ruleValues,
      behavior: behavior as PermissionBehavior,
      destination: source as PermissionUpdateDestination,
    })
  }

  return updates
}

/** 将权限规则应用到上下文（累加模式 - 用于初始设置） */
export function applyPermissionRulesToPermissionContext(
  toolPermissionContext: ToolPermissionContext,
  rules: PermissionRule[],
): ToolPermissionContext {
  const updates = convertRulesToUpdates(rules, 'addRules')
  return applyPermissionUpdates(toolPermissionContext, updates)
}

/** 从磁盘同步权限规则（替换模式 - 用于设置变更） */
export function syncPermissionRulesFromDisk(
  toolPermissionContext: ToolPermissionContext,
  rules: PermissionRule[],
): ToolPermissionContext {
  let context = toolPermissionContext

  // 当启用 allowManagedPermissionRulesOnly 时，清除所有非策略来源的规则
  if (shouldAllowManagedPermissionRulesOnly()) {
    const sourcesToClear: PermissionUpdateDestination[] = [
      'userSettings',
      'projectSettings',
      'localSettings',
      'cliArg',
      'session',
    ]
    const behaviors: PermissionBehavior[] = ['allow', 'deny', 'ask']

    for (const source of sourcesToClear) {
      for (const behavior of behaviors) {
        context = applyPermissionUpdate(context, {
          type: 'replaceRules',
          rules: [],
          behavior,
          destination: source,
        })
      }
    }
  }

  // 在应用新规则前，清除所有基于磁盘的来源:行为组合。若不这样做
  // ，从设置中移除规则（例如删除一个拒绝条目）会导致旧规则残留在上
  // 下文中，因为 convertRulesToUpdates
  // 仅针对有规则的来源:行为对生成 replaceRules —
  // — 空分组不会产生更新，因此过时的规则会持续存在。
  const diskSources: PermissionUpdateDestination[] = [
    'userSettings',
    'projectSettings',
    'localSettings',
  ]
  for (const diskSource of diskSources) {
    for (const behavior of ['allow', 'deny', 'ask'] as PermissionBehavior[]) {
      context = applyPermissionUpdate(context, {
        type: 'replaceRules',
        rules: [],
        behavior,
        destination: diskSource,
      })
    }
  }

  const updates = convertRulesToUpdates(rules, 'replaceRules')
  return applyPermissionUpdates(context, updates)
}

/** 从权限结果中提取 updatedInput，若不存在则回退到原始输入。
处理某些 PermissionResult 变体没有 updatedInput 的情况。 */
function getUpdatedInputOrFallback(
  permissionResult: PermissionResult,
  fallback: Record<string, unknown>,
): Record<string, unknown> {
  return (
    ('updatedInput' in permissionResult
      ? permissionResult.updatedInput
      : undefined) ?? fallback
  )
}
