import { feature } from 'bun:bundle'
import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import uniqBy from 'lodash-es/uniqBy.js'
import { dirname } from 'path'
import { getProjectRoot } from 'src/bootstrap/state.js'
import {
  builtInCommandNames,
  findCommand,
  getCommands,
  type PromptCommand,
} from 'src/commands.js'
import type {
  Tool,
  ToolCallProgress,
  ToolResult,
  ToolUseContext,
  ValidationResult,
} from 'src/Tool.js'
import { buildTool, type ToolDef } from 'src/Tool.js'
import type { Command } from 'src/types/command.js'
import type {
  AssistantMessage,
  AttachmentMessage,
  Message,
  SystemMessage,
  UserMessage,
} from 'src/types/message.js'
import { logForDebugging } from 'src/utils/debug.js'
import type { PermissionDecision } from 'src/utils/permissions/PermissionResult.js'
import { getRuleByContentsForTool } from 'src/utils/permissions/permissions.js'
import {
  isOfficialMarketplaceName,
  parsePluginIdentifier,
} from 'src/utils/plugins/pluginIdentifier.js'
import { buildPluginCommandTelemetryFields } from 'src/utils/telemetry/pluginTelemetry.js'
import { z } from 'zod/v4'
import {
  addInvokedSkill,
  clearInvokedSkillsForAgent,
  getSessionId,
} from 'src/bootstrap/state.js'
import { COMMAND_MESSAGE_TAG } from 'src/constants/xml.js'
import type { CanUseToolFn } from 'src/hooks/useCanUseTool.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
  logEvent,
} from 'src/services/analytics/index.js'
import { getAgentContext } from 'src/utils/agentContext.js'
import { errorMessage } from 'src/utils/errors.js'
import {
  extractResultText,
  prepareForkedCommandContext,
} from 'src/utils/forkedAgent.js'
import { parseFrontmatter } from 'src/utils/frontmatterParser.js'
import { lazySchema } from 'src/utils/lazySchema.js'
import { createUserMessage, normalizeMessages } from 'src/utils/messages.js'
import type { ModelAlias } from 'src/utils/model/aliases.js'
import { resolveSkillModelOverride } from 'src/utils/model/model.js'
import { recordSkillUsage } from 'src/utils/suggestions/skillUsageTracking.js'
import { createAgentId } from 'src/utils/uuid.js'
import { runAgent } from '../AgentTool/runAgent.js'
import {
  getToolUseIDFromParentMessage,
  tagMessagesWithToolUseID,
} from '../utils.js'
import { SKILL_TOOL_NAME } from './constants.js'
import { getPrompt } from './prompt.js'
import {
  renderToolResultMessage,
  renderToolUseErrorMessage,
  renderToolUseMessage,
  renderToolUseProgressMessage,
  renderToolUseRejectedMessage,
} from './UI.js'

/** 从 AppState 获取所有命令，包括 MCP 技能/提示。
SkillTool 需要这个，因为 getCommands() 只返回本地/捆绑的技能。 */
async function getAllCommands(context: ToolUseContext): Promise<Command[]> {
  // 仅包含 MCP 技能（loadedFrom === 'mcp'），不包括普
  // 通的 MCP 提示。在此过滤器之前，模型如果猜到了 mcp__serve
  // r__prompt 名称，可以通过 SkillTool 调用 MCP 提示
  // ——它们不可发现，但技术上可达。
  const mcpSkills = context
    .getAppState()
    .mcp.commands.filter(
      cmd => cmd.type === 'prompt' && cmd.loadedFrom === 'mcp',
    )
  if (mcpSkills.length === 0) return getCommands(getProjectRoot())
  const localCommands = await getCommands(getProjectRoot())
  return uniqBy([...localCommands, ...mcpSkills], 'name')
}

// 从集中式类型重新导出 Progress，以打破导入循环
export type { SkillToolProgress as Progress } from 'src/types/tools.js'

import type { SkillToolProgress as Progress } from 'src/types/tools.js'

// 远程技能模块的条件性 require —— 此处的静态导入会拉入 akiBackend.ts（
// 通过 remoteSkillLoader → akiBackend），该文件包含模块级的
// memoize()/lazySchema() 常量，这些常量作为具有副作用的初始化器在 tre
// e-shaking 后仍然存在。所有使用都在 feature('E
// XPERIMENTAL_SKILL_SEARCH') 守卫内部，因此 remoteSkil
// lModules 在每个调用点都非空。
/* eslint-disable @typescript-eslint/no-require-imports */
const remoteSkillModules = feature('EXPERIMENTAL_SKILL_SEARCH')
  ? {
      ...(require('src/services/skillSearch/remoteSkillState.js') as typeof import('src/services/skillSearch/remoteSkillState.js')),
      ...(require('src/services/skillSearch/remoteSkillLoader.js') as typeof import('src/services/skillSearch/remoteSkillLoader.js')),
      ...(require('src/services/skillSearch/telemetry.js') as typeof import('src/services/skillSearch/telemetry.js')),
      ...(require('src/services/skillSearch/featureCheck.js') as typeof import('src/services/skillSearch/featureCheck.js')),
    }
  : null
/* eslint-enable @typescript-eslint/no-require-imports */

/** 在分叉的子代理上下文中执行技能。
这会在一个拥有独立令牌预算的隔离代理中运行技能提示。 */
async function executeForkedSkill(
  command: Command & { type: 'prompt' },
  commandName: string,
  args: string | undefined,
  context: ToolUseContext,
  canUseTool: CanUseToolFn,
  parentMessage: AssistantMessage,
  onProgress?: ToolCallProgress<Progress>,
): Promise<ToolResult<Output>> {
  const startTime = Date.now()
  const agentId = createAgentId()
  const isBuiltIn = builtInCommandNames().has(commandName)
  const isOfficialSkill = isOfficialMarketplaceSkill(command)
  const isBundled = command.source === 'bundled'
  const forkedSanitizedName =
    isBuiltIn || isBundled || isOfficialSkill ? commandName : 'custom'

  const wasDiscoveredField =
    feature('EXPERIMENTAL_SKILL_SEARCH') &&
    remoteSkillModules!.isSkillSearchEnabled()
      ? {
          was_discovered:
            context.discoveredSkillNames?.has(commandName) ?? false,
        }
      : {}
  const pluginMarketplace = command.pluginInfo
    ? parsePluginIdentifier(command.pluginInfo.repository).marketplace
    : undefined
  const queryDepth = context.queryTracking?.depth ?? 0
  const parentAgentId = getAgentContext()?.agentId
  logEvent('tengu_skill_tool_invocation', {
    command_name:
      forkedSanitizedName as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    // _PROTO_skill_name 路由到特权 skill_name B
    // Q 列（未脱敏，所有用户可见）；command_name 保留在 additio
    // nal_metadata 中，作为通用访问仪表板的脱敏版本。
    _PROTO_skill_name:
      commandName as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
    execution_context:
      'fork' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    invocation_trigger: (queryDepth > 0
      ? 'nested-skill'
      : 'claude-proactive') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    query_depth: queryDepth,
    ...(parentAgentId && {
      parent_agent_id:
        parentAgentId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    }),
    ...wasDiscoveredField,
    ...(process.env.USER_TYPE === 'ant' && {
      skill_name:
        commandName as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      skill_source:
        command.source as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      ...(command.loadedFrom && {
        skill_loaded_from:
          command.loadedFrom as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      }),
      ...(command.kind && {
        skill_kind:
          command.kind as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      }),
    }),
    ...(command.pluginInfo && {
      // _PROTO_* 路由到标记了 PII 的 plugin_name/marketplace_name BQ
      // 列（未脱敏，所有用户可见）；plugin_name/plugin_repository 保留
      // 在 additional_metadata 中，作为脱敏版本。
      _PROTO_plugin_name: command.pluginInfo.pluginManifest
        .name as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
      ...(pluginMarketplace && {
        _PROTO_marketplace_name:
          pluginMarketplace as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
      }),
      plugin_name: (isOfficialSkill
        ? command.pluginInfo.pluginManifest.name
        : 'third-party') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      plugin_repository: (isOfficialSkill
        ? command.pluginInfo.repository
        : 'third-party') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      ...buildPluginCommandTelemetryFields(command.pluginInfo),
    }),
  })

  const { modifiedGetAppState, baseAgent, promptMessages, skillContent } =
    await prepareForkedCommandContext(command, args || '', context)

  // 将技能的 effort 合并到代理定义中，以便 runAgent 应用它
  const agentDefinition =
    command.effort !== undefined
      ? { ...baseAgent, effort: command.effort }
      : baseAgent

  // 从分叉的代理收集消息
  const agentMessages: Message[] = []

  logForDebugging(
    `SkillTool 正在使用代理 ${agentDefinition.agentType} 执行分叉技能 ${commandName}`,
  )

  try {
    // 运行子代理
    for await (const message of runAgent({
      agentDefinition,
      promptMessages,
      toolUseContext: {
        ...context,
        getAppState: modifiedGetAppState,
      },
      canUseTool,
      isAsync: false,
      querySource: 'agent:custom',
      model: command.model as ModelAlias | undefined,
      availableTools: context.options.tools,
      override: { agentId },
    })) {
      agentMessages.push(message)

      // 报告工具使用的进度（像 AgentTool 那样）
      if (
        (message.type === 'assistant' || message.type === 'user') &&
        onProgress
      ) {
        const normalizedNew = normalizeMessages([message])
        for (const m of normalizedNew) {
          const contentArray = m.message?.content
          const hasToolContent =
            Array.isArray(contentArray) &&
            contentArray.some(
              (c: { type: string }) =>
                c.type === 'tool_use' || c.type === 'tool_result',
            )
          if (hasToolContent) {
            onProgress({
              toolUseID: `skill_${parentMessage.message.id}`,
              data: {
                message: m,
                type: 'skill_progress',
                prompt: skillContent,
                agentId,
              },
            })
          }
        }
      }
    }

    const resultText = extractResultText(agentMessages, '技能执行完成')
    // 提取结果后释放消息内存
    agentMessages.length = 0

    const durationMs = Date.now() - startTime
    logForDebugging(
      `SkillTool 分叉技能 ${commandName} 在 ${durationMs}ms 内完成`,
    )

    return {
      data: {
        success: true,
        commandName,
        status: 'forked',
        agentId,
        result: resultText,
      },
    }
  } finally {
    // 从 invokedSkills 状态中释放技能内容
    clearInvokedSkillsForAgent(agentId)
  }
}

export const inputSchema = lazySchema(() =>
  z.object({
    skill: z
      .string()
      .describe('技能名称。例如："commit"、"review-pr" 或 "pdf"'),
    args: z.string().optional().describe('技能的可选参数'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

export const outputSchema = lazySchema(() => {
  // 内联技能（默认）的输出模式
  const inlineOutputSchema = z.object({
    success: z.boolean().describe('技能是否有效'),
    commandName: z.string().describe('技能的名称'),
    allowedTools: z
      .array(z.string())
      .optional()
      .describe('此技能允许使用的工具'),
    model: z.string().optional().describe('如果指定了，则覆盖模型'),
    status: z.literal('inline').optional().describe('执行状态'),
  })

  // 分叉技能的输出模式
  const forkedOutputSchema = z.object({
    success: z.boolean().describe('技能是否成功完成'),
    commandName: z.string().describe('技能的名称'),
    status: z.literal('forked').describe('执行状态'),
    agentId: z.string().describe('执行技能的子代理的 ID'),
    result: z.string().describe('分叉技能执行的结果'),
  })

  return z.union([inlineOutputSchema, forkedOutputSchema])
})
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.input<OutputSchema>

export const SkillTool: Tool<InputSchema, Output, Progress> = buildTool({
  name: SKILL_TOOL_NAME,
  searchHint: '调用一个斜杠命令技能',
  maxResultSizeChars: 100_000,
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },

  description: async ({ skill }) => `执行技能：${skill}`,

  prompt: async () => getPrompt(getProjectRoot()),

  // 一次只应运行一个技能/命令，因为该工具会将命令扩展为完
  // 整的提示，Claude 必须在继续之前处理它。Ski
  // ll-coach 需要技能名称，以避免在 X 技能实际
  // 被调用时误报“你可以使用技能 X”的建议。Backsea
  // t 对来自扩展提示的下游工具调用进行分类，而不是这个包
  // 装器，因此仅名称就足够了——它只是记录技能已触发。
  toAutoClassifierInput: ({ skill }) => skill ?? '',

  async validateInput({ skill }, context): Promise<ValidationResult> {
    // 技能只是技能名称，没有参数
    const trimmed = skill.trim()
    if (!trimmed) {
      return {
        result: false,
        message: `无效的技能格式：${skill}`,
        errorCode: 1,
      }
    }

    // 如果存在前导斜杠则移除（为了兼容性）
    const hasLeadingSlash = trimmed.startsWith('/')
    if (hasLeadingSlash) {
      logEvent('tengu_skill_tool_slash_prefix', {})
    }
    const normalizedCommandName = hasLeadingSlash
      ? trimmed.substring(1)
      : trimmed

    // 远程规范技能处理（仅限 ant 的实验性功能）。在本地命
    // 令查找之前拦截 `_canonical_<slug>`
    // 名称，因为远程技能不在本地命令注册表中。
    if (
      feature('EXPERIMENTAL_SKILL_SEARCH') &&
      process.env.USER_TYPE === 'ant'
    ) {
      const slug = remoteSkillModules!.stripCanonicalPrefix(
        normalizedCommandName,
      )
      if (slug !== null) {
        const meta = remoteSkillModules!.getDiscoveredRemoteSkill(slug)
        if (!meta) {
          return {
            result: false,
            message: `远程技能 ${slug} 未在此会话中发现。请先使用 DiscoverSkills 来查找远程技能。`,
            errorCode: 6,
          }
        }
        // 已发现的远程技能——有效。加载操作在 call() 中进行。
        return { result: true }
      }
    }

    // 获取可用命令（包括 MCP 技能）
    const commands = await getAllCommands(context)

    // 检查命令是否存在
    const foundCommand = findCommand(normalizedCommandName, commands)
    if (!foundCommand) {
      return {
        result: false,
        message: `未知技能：${normalizedCommandName}`,
        errorCode: 2,
      }
    }

    // 检查命令是否禁用了模型调用
    if (foundCommand.disableModelInvocation) {
      return {
        result: false,
        message: `由于 disable-model-invocation，技能 ${normalizedCommandName} 无法与 ${SKILL_TOOL_NAME} 工具一起使用`,
        errorCode: 4,
      }
    }

    // 检查命令是否为基于提示的命令
    if (foundCommand.type !== 'prompt') {
      return {
        result: false,
        message: `技能 ${normalizedCommandName} 不是基于提示的技能`,
        errorCode: 5,
      }
    }

    return { result: true }
  },

  async checkPermissions(
    { skill, args },
    context,
  ): Promise<PermissionDecision> {
    // 技能只是技能名称，没有参数
    const trimmed = skill.trim()

    // 如果存在前导斜杠则移除（为了兼容性）
    const commandName = trimmed.startsWith('/') ? trimmed.substring(1) : trimmed

    const appState = context.getAppState()
    const permissionContext = appState.toolPermissionContext

    // 查找命令对象以作为元数据传递
    const commands = await getAllCommands(context)
    const commandObj = findCommand(commandName, commands)

    // 检查规则是否与技能匹配的辅助函数。
    // 通过去除前导斜杠来规范化两个输入，以实现一致的匹配
    const ruleMatches = (ruleContent: string): boolean => {
      // 通过去除前导斜杠来规范化规则内容
      const normalizedRule = ruleContent.startsWith('/')
        ? ruleContent.substring(1)
        : ruleContent

      // 检查精确匹配（使用规范化的 commandName）
      if (normalizedRule === commandName) {
        return true
      }
      // 检查前缀匹配（例如，"review:*" 匹配 "review-pr 123"）
      if (normalizedRule.endsWith(':*')) {
        const prefix = normalizedRule.slice(0, -2) // 移除 ':*'
        return commandName.startsWith(prefix)
      }
      return false
    }

    // 检查拒绝规则
    const denyRules = getRuleByContentsForTool(
      permissionContext,
      SkillTool as Tool,
      'deny',
    )
    for (const [ruleContent, rule] of denyRules.entries()) {
      if (ruleMatches(ruleContent)) {
        return {
          behavior: 'deny',
          message: `技能执行被权限规则阻止`,
          decisionReason: {
            type: 'rule',
            rule,
          },
        }
      }
    }

    // 远程规范技能是仅限 ant 的实验性功能——自动授予。放在拒
    // 绝循环之后，以便用户配置的 Skill(_canonical_:
    // *) 拒绝规则得到遵守（与下面 safe-properties 自动
    // 允许的模式相同）。技能内容本身是规范/策划的，不是用户编写的。
    if (
      feature('EXPERIMENTAL_SKILL_SEARCH') &&
      process.env.USER_TYPE === 'ant'
    ) {
      const slug = remoteSkillModules!.stripCanonicalPrefix(commandName)
      if (slug !== null) {
        return {
          behavior: 'allow',
          updatedInput: { skill, args },
          decisionReason: undefined,
        }
      }
    }

    // 检查允许规则
    const allowRules = getRuleByContentsForTool(
      permissionContext,
      SkillTool as Tool,
      'allow',
    )
    for (const [ruleContent, rule] of allowRules.entries()) {
      if (ruleMatches(ruleContent)) {
        return {
          behavior: 'allow',
          updatedInput: { skill, args },
          decisionReason: {
            type: 'rule',
            rule,
          },
        }
      }
    }

    // 自动允许仅使用安全属性的技能。
    // 这是一个允许列表：如果技能有任何属性不在此集
    // 合中且具有有意义的取值，则需要权限。这确保了未
    // 来添加的新属性默认需要权限。
    if (
      commandObj?.type === 'prompt' &&
      skillHasOnlySafeProperties(commandObj)
    ) {
      return {
        behavior: 'allow',
        updatedInput: { skill, args },
        decisionReason: undefined,
      }
    }

    // 为精确技能和前缀准备建议。使用规范化
    // 的 commandName（无前导斜杠）以实现一致的规则
    const suggestions = [
      // 精确技能建议
      {
        type: 'addRules' as const,
        rules: [
          {
            toolName: SKILL_TOOL_NAME,
            ruleContent: commandName,
          },
        ],
        behavior: 'allow' as const,
        destination: 'localSettings' as const,
      },
      // 允许任何参数的前缀建议
      {
        type: 'addRules' as const,
        rules: [
          {
            toolName: SKILL_TOOL_NAME,
            ruleContent: `${commandName}:*`,
          },
        ],
        behavior: 'allow' as const,
        destination: 'localSettings' as const,
      },
    ]

    // 默认行为：向用户请求权限
    return {
      behavior: 'ask',
      message: `执行技能：${commandName}`,
      decisionReason: undefined,
      suggestions,
      updatedInput: { skill, args },
      metadata: commandObj ? { command: commandObj } : undefined,
    }
  },

  async call(
    { skill, args },
    context,
    canUseTool,
    parentMessage,
    onProgress?,
  ): Promise<ToolResult<Output>> {
    // 此时，validateInput 已经确认：
    // -技能 格式有效
    //- 技能 存在
    //- 技能 可以加载
    //- 技能 没有 disableModelInvocation
    //- 技能 是基于提示的技能

    // 技能只是名称，带有可选参数
    const trimmed = skill.trim()

    // 如果存在前导斜杠则移除（为了兼容性）
    const commandName = trimmed.startsWith('/') ? trimmed.substring(1) : trimmed

    // 远程规范技能执行（仅限 ant 的实验性功能）。在本地命令查找之前
    // 拦截 `_canonical_<slug>` —— 从 AKI/GC
    // S 加载 SKILL.md（使用本地缓存），将内容直接作为用户消息注入
    // 。远程技能是声明性 markdown，因此不需要斜杠命令扩展（不需
    // 要 !command 替换，不需要 $ARGUMENTS 插值）。
    if (
      feature('EXPERIMENTAL_SKILL_SEARCH') &&
      process.env.USER_TYPE === 'ant'
    ) {
      const slug = remoteSkillModules!.stripCanonicalPrefix(commandName)
      if (slug !== null) {
        return executeRemoteSkill(slug, commandName, parentMessage, context)
      }
    }

    const commands = await getAllCommands(context)
    const command = findCommand(commandName, commands)

    // 跟踪技能使用情况以进行排名
    recordSkillUsage(commandName)

    // 检查技能是否应作为分叉的子代理运行
    if (command?.type === 'prompt' && command.context === 'fork') {
      return executeForkedSkill(
        command,
        commandName,
        args,
        context,
        canUseTool,
        parentMessage,
        onProgress,
      )
    }

    // 处理带有可选参数的技能
    const { processPromptSlashCommand } = await import(
      'src/utils/processUserInput/processSlashCommand.js'
    )
    const processedCommand = await processPromptSlashCommand(
      commandName,
      args || '', // 如果提供了参数则传递
      commands,
      context,
    )

    if (!processedCommand.shouldQuery) {
      throw new Error('命令处理失败')
    }

    // 从命令中提取元数据
    const allowedTools = processedCommand.allowedTools || []
    const model = processedCommand.model
    const effort = command?.type === 'prompt' ? command.effort : undefined

    const isBuiltIn = builtInCommandNames().has(commandName)
    const isBundled = command?.type === 'prompt' && command.source === 'bundled'
    const isOfficialSkill =
      command?.type === 'prompt' && isOfficialMarketplaceSkill(command)
    const sanitizedCommandName =
      isBuiltIn || isBundled || isOfficialSkill ? commandName : 'custom'

    const wasDiscoveredField =
      feature('EXPERIMENTAL_SKILL_SEARCH') &&
      remoteSkillModules!.isSkillSearchEnabled()
        ? {
            was_discovered:
              context.discoveredSkillNames?.has(commandName) ?? false,
          }
        : {}
    const pluginMarketplace =
      command?.type === 'prompt' && command.pluginInfo
        ? parsePluginIdentifier(command.pluginInfo.repository).marketplace
        : undefined
    const queryDepth = context.queryTracking?.depth ?? 0
    const parentAgentId = getAgentContext()?.agentId
    logEvent('tengu_skill_tool_invocation', {
      command_name:
        sanitizedCommandName as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      // _PROTO_skill_name 路由到特权 skill_name B
      // Q 列（未脱敏，所有用户可见）；command_name 保留在 additio
      // nal_metadata 中，作为通用访问仪表板的脱敏版本。
      _PROTO_skill_name:
        commandName as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
      execution_context:
        'inline' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      invocation_trigger: (queryDepth > 0
        ? 'nested-skill'
        : 'claude-proactive') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      query_depth: queryDepth,
      ...(parentAgentId && {
        parent_agent_id:
          parentAgentId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      }),
      ...wasDiscoveredField,
      ...(process.env.USER_TYPE === 'ant' && {
        skill_name:
          commandName as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        ...(command?.type === 'prompt' && {
          skill_source:
            command.source as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        }),
        ...(command?.loadedFrom && {
          skill_loaded_from:
            command.loadedFrom as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        }),
        ...(command?.kind && {
          skill_kind:
            command.kind as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        }),
      }),
      ...(command?.type === 'prompt' &&
        command.pluginInfo && {
          _PROTO_plugin_name: command.pluginInfo.pluginManifest
            .name as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
          ...(pluginMarketplace && {
            _PROTO_marketplace_name:
              pluginMarketplace as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
          }),
          plugin_name: (isOfficialSkill
            ? command.pluginInfo.pluginManifest.name
            : 'third-party') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          plugin_repository: (isOfficialSkill
            ? command.pluginInfo.repository
            : 'third-party') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          ...buildPluginCommandTelemetryFields(command.pluginInfo),
        }),
    })

    // 从父消息中获取工具使用 ID，以便链接 newMessages
    const toolUseID = getToolUseIDFromParentMessage(
      parentMessage,
      SKILL_TOOL_NAME,
    )

    // 用 sourceToolUseID 标记用户消息，使它们在此工具解析之前保持临时状态
    const newMessages = tagMessagesWithToolUseID(
      processedCommand.messages.filter(
        (m): m is UserMessage | AttachmentMessage | SystemMessage => {
          if (m.type === 'progress') {
            return false
          }
          // 过滤掉 command-message，因为 SkillTool 处理显示
          if (m.type === 'user' && 'message' in m) {
            const content = m.message.content
            if (
              typeof content === 'string' &&
              content.includes(`<${COMMAND_MESSAGE_TAG}>`)
            ) {
              return false
            }
          }
          return true
        },
      ),
      toolUseID,
    )

    logForDebugging(
      `SkillTool 为技能 ${commandName} 返回 ${newMessages.length} 条新消息`,
    )

    // 注意：addInvokedSkill 和 registerSkillHooks 已在
    // processPromptSlashCommand 内部调用（通过 getMessages
    // ForPromptSlashCommand），因此在此处再次调用会导致重复注册钩子和冗
    // 余重建 skillContent。

    // 返回成功，包含 newMessages 和 contextModifier
    return {
      data: {
        success: true,
        commandName,
        allowedTools: allowedTools.length > 0 ? allowedTools : undefined,
        model,
      },
      newMessages,
      contextModifier(ctx) {
        let modifiedContext = ctx

        // 如果指定了，则更新允许的工具
        if (allowedTools.length > 0) {
          // 捕获当前的 getAppState 以正确链接修改
          const previousGetAppState = modifiedContext.getAppState
          modifiedContext = {
            ...modifiedContext,
            getAppState() {
              // 使用前一个 getAppState，而非闭包中的 context.ge
              // tAppState，以正确链接上下文修改
              const appState = previousGetAppState()
              return {
                ...appState,
                toolPermissionContext: {
                  ...appState.toolPermissionContext,
                  alwaysAllowRules: {
                    ...appState.toolPermissionContext.alwaysAllowRules,
                    command: [
                      ...new Set([
                        ...(appState.toolPermissionContext.alwaysAllowRules
                          .command || []),
                        ...allowedTools,
                      ]),
                    ],
                  },
                },
              }
            },
          }
        }

        // 保留 [1m] 后缀 —— 否则，在 opus[1m] 会话中，一个
        // `model: opus` 的技能会将有效窗口降至 200K 并触发自动压缩。
        if (model) {
          modifiedContext = {
            ...modifiedContext,
            options: {
              ...modifiedContext.options,
              mainLoopModel: resolveSkillModelOverride(
                model,
                ctx.options.mainLoopModel,
              ),
            },
          }
        }

        // 如果技能指定了，则覆盖 effort level
        if (effort !== undefined) {
          const previousGetAppState = modifiedContext.getAppState
          modifiedContext = {
            ...modifiedContext,
            getAppState() {
              const appState = previousGetAppState()
              return {
                ...appState,
                effortValue: effort,
              }
            },
          }
        }

        return modifiedContext
      },
    }
  },

  mapToolResultToToolResultBlockParam(
    result: Output,
    toolUseID: string,
  ): ToolResultBlockParam {
    // 处理分叉技能结果
    if ('status' in result && result.status === 'forked') {
      return {
        type: 'tool_result' as const,
        tool_use_id: toolUseID,
        content: `技能 "${result.commandName}" 已完成（分叉执行）。

结果：
${result.result}`,
      }
    }

    // 内联技能结果（默认）
    return {
      type: 'tool_result' as const,
      tool_use_id: toolUseID,
      content: `正在启动技能：${result.commandName}`,
    }
  },

  renderToolResultMessage,
  renderToolUseMessage,
  renderToolUseProgressMessage,
  renderToolUseRejectedMessage,
  renderToolUseErrorMessage,
} satisfies ToolDef<InputSchema, Output, Progress>)

// PromptCommand 属性键的安全允许列表，这些属性安全且
// 不需要权限。如果技能有任何属性不在此集合中且具有有意义的值，则
// 需要权限。这确保了未来添加到 PromptCommand
// 的新属性默认需要权限，直到经过明确审查并添加到此列表中。
const SAFE_SKILL_PROPERTIES = new Set([
  // PromptCommand 属性
  'type',
  'progressMessage',
  'contentLength',
  'argNames',
  'model',
  'effort',
  'source',
  'pluginInfo',
  'disableNonInteractive',
  'skillRoot',
  'context',
  'agent',
  'getPromptForCommand',
  'frontmatterKeys',
  // CommandBase 属性
  'name',
  'description',
  'hasUserSpecifiedDescription',
  'isEnabled',
  'isHidden',
  'aliases',
  'isMcp',
  'argumentHint',
  'whenToUse',
  'paths',
  'version',
  'disableModelInvocation',
  'userInvocable',
  'loadedFrom',
  'immediate',
  'userFacingName',
])

function skillHasOnlySafeProperties(command: Command): boolean {
  for (const key of Object.keys(command)) {
    if (SAFE_SKILL_PROPERTIES.has(key)) {
      continue
    }
    // 属性不在安全允许列表中 - 检查其是否具有有意义的值
    const value = (command as Record<string, unknown>)[key]
    if (value === undefined || value === null) {
      continue
    }
    if (Array.isArray(value) && value.length === 0) {
      continue
    }
    if (
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0
    ) {
      continue
    }
    return false
  }
  return true
}

function isOfficialMarketplaceSkill(command: PromptCommand): boolean {
  if (command.source !== 'plugin' || !command.pluginInfo?.repository) {
    return false
  }
  return isOfficialMarketplaceName(
    parsePluginIdentifier(command.pluginInfo.repository).marketplace,
  )
}

/** 提取用于遥测的 URL 方案。对于无法识别的方案，默认为 'gs'，因为 AKI 后端是唯一的生产路径，并且加载器在我们到达遥测之前就会对未知方案抛出错误。 */
function extractUrlScheme(url: string): 'gs' | 'http' | 'https' | 's3' {
  if (url.startsWith('gs://')) return 'gs'
  if (url.startsWith('https://')) return 'https'
  if (url.startsWith('http://')) return 'http'
  if (url.startsWith('s3://')) return 's3'
  return 'gs'
}

/** 加载远程规范技能并将其 SKILL.md 内容注入对话。与本地技能（通过 processPromptSlashCommand 进行 !command / $ARGUMENTS 扩展）不同，远程技能是声明式 Markdown —— 我们直接将内容包装在用户消息中。

该技能也会通过 addInvokedSkill 注册，以便在压缩后保留（与本地技能相同）。

仅在 call() 中的 feature('EXPERIMENTAL_SKILL_SEARCH') 守卫内调用 —— 此处的 remoteSkillModules 非空。 */
async function executeRemoteSkill(
  slug: string,
  commandName: string,
  parentMessage: AssistantMessage,
  context: ToolUseContext,
): Promise<ToolResult<Output>> {
  const { getDiscoveredRemoteSkill, loadRemoteSkill, logRemoteSkillLoaded } =
    remoteSkillModules!

  // validateInput 已确认此 slug 存在于会话状态
  // 中，但我们在此处重新获取以获取 URL。如果它因某种原因丢失（例
  // 如，会话中途状态被清除），则返回清晰的错误而非崩溃。
  const meta = getDiscoveredRemoteSkill(slug)
  if (!meta) {
    throw new Error(
      `远程技能 ${slug} 未在此会话中发现。请先使用 DiscoverSkills 查找远程技能。`,
    )
  }

  const urlScheme = extractUrlScheme(meta.url)
  let loadResult
  try {
    loadResult = await loadRemoteSkill(slug, meta.url)
  } catch (e) {
    const msg = errorMessage(e)
    logRemoteSkillLoaded({
      slug,
      cacheHit: false,
      latencyMs: 0,
      urlScheme,
      error: msg,
    })
    throw new Error(`加载远程技能 ${slug} 失败：${msg}`)
  }

  const {
    cacheHit,
    latencyMs,
    skillPath,
    content,
    fileCount,
    totalBytes,
    fetchMethod,
  } = loadResult

  logRemoteSkillLoaded({
    slug,
    cacheHit,
    latencyMs,
    urlScheme,
    fileCount,
    totalBytes,
    fetchMethod,
  })

  // 远程技能始终是通过模型发现的（从不在静态 skill_listing 中），因
  // 此 was_discovered 始终为 true。is_remote
  // 让 BQ 查询能够区分远程和本地调用，而无需通过技能名称前缀进行连接。
  const queryDepth = context.queryTracking?.depth ?? 0
  const parentAgentId = getAgentContext()?.agentId
  logEvent('tengu_skill_tool_invocation', {
    command_name:
      'remote_skill' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    // _PROTO_skill_name 路由到特权 skill_name BQ 列（未
    // 编辑，所有用户可见）；command_name 保留在 additional_metada
    // ta 中作为编辑后的变体。
    _PROTO_skill_name:
      commandName as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
    execution_context:
      'remote' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    invocation_trigger: (queryDepth > 0
      ? 'nested-skill'
      : 'claude-proactive') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    query_depth: queryDepth,
    ...(parentAgentId && {
      parent_agent_id:
        parentAgentId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    }),
    was_discovered: true,
    is_remote: true,
    remote_cache_hit: cacheHit,
    remote_load_latency_ms: latencyMs,
    ...(process.env.USER_TYPE === 'ant' && {
      skill_name:
        commandName as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      remote_slug:
        slug as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    }),
  })

  recordSkillUsage(commandName)

  logForDebugging(
    `SkillTool 加载了远程技能 ${slug} (cacheHit=${cacheHit}, ${latencyMs}ms, ${content.length} 字符)`,
  )

  // 在添加标题前去除 YAML 前言 (---\nname: x\n---)（与
  // loadSkillsDir.ts:333 匹配）。如果不存在前言，par
  // seFrontmatter 会返回未更改的原始内容。
  const { content: bodyContent } = parseFrontmatter(content, skillPath)

  // 注入基础目录标题 + ${CLAUDE_SKILL_DIR}/${CLAUDE_SESS
  // ION_ID} 替换（与 loadSkillsDir.ts 匹配），以便模型可以解析相对于
  // 缓存目录的相对引用，如 ./schemas/foo.json。
  const skillDir = dirname(skillPath)
  const normalizedDir =
    process.platform === 'win32' ? skillDir.replace(/\\/g, '/') : skillDir
  let finalContent = `此技能的基础目录：${normalizedDir}

${bodyContent}`
  finalContent = finalContent.replace(/\$\{CLAUDE_SKILL_DIR\}/g, normalizedDir)
  finalContent = finalContent.replace(
    /\$\{CLAUDE_SESSION_ID\}/g,
    getSessionId(),
  )

  // 注册到压缩保留状态。使用缓存的文件路径，以便压缩后恢复知道内容
  // 来源。必须使用 finalContent（而非原始内容），
  // 以便基础目录标题和 ${CLAUDE_SKILL_DI
  // R} 替换在压缩后得以保留 —— 这与本地技能通过 proce
  // ssSlashCommand 存储其已转换内容的方式匹配。
  addInvokedSkill(
    commandName,
    skillPath,
    finalContent,
    getAgentContext()?.agentId ?? null,
  )

  // 直接注入 —— 将 SKILL.md 内容包装在元用户消息中。与 pro
  // cessPromptSlashCommand 为简单技能生成的格式匹配。
  const toolUseID = getToolUseIDFromParentMessage(
    parentMessage,
    SKILL_TOOL_NAME,
  )
  return {
    data: { success: true, commandName, status: 'inline' },
    newMessages: tagMessagesWithToolUseID(
      [createUserMessage({ content: finalContent, isMeta: true })],
      toolUseID,
    ),
  }
}
