import type Anthropic from '@anthropic-ai/sdk'
import type {
  BetaTool,
  BetaToolUnion,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import { createHash } from 'crypto'
import { SYSTEM_PROMPT_DYNAMIC_BOUNDARY } from 'src/constants/prompts.js'
import { getSystemContext, getUserContext } from 'src/context.js'
import { isAnalyticsDisabled } from 'src/services/analytics/config.js'
import {
  checkStatsigFeatureGate_CACHED_MAY_BE_STALE,
  getFeatureValue_CACHED_MAY_BE_STALE,
} from 'src/services/analytics/growthbook.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js'
import { prefetchAllMcpResources } from 'src/services/mcp/client.js'
import type { ScopedMcpServerConfig } from 'src/services/mcp/types.js'
import { BashTool } from '@claude-code-best/builtin-tools/tools/BashTool/BashTool.js'
import { FileEditTool } from '@claude-code-best/builtin-tools/tools/FileEditTool/FileEditTool.js'
import {
  normalizeFileEditInput,
  stripTrailingWhitespace,
} from '@claude-code-best/builtin-tools/tools/FileEditTool/utils.js'
import { FileWriteTool } from '@claude-code-best/builtin-tools/tools/FileWriteTool/FileWriteTool.js'
import { getTools } from 'src/tools.js'
import type { AgentId } from 'src/types/ids.js'
import type { z } from 'zod/v4'
import { CLI_SYSPROMPT_PREFIXES } from '../constants/system.js'
import { roughTokenCountEstimation } from '../services/tokenEstimation.js'
import type { Tool, ToolPermissionContext, Tools } from '../Tool.js'
import { AGENT_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/AgentTool/constants.js'
import type { AgentDefinition } from '@claude-code-best/builtin-tools/tools/AgentTool/loadAgentsDir.js'
import { EXIT_PLAN_MODE_V2_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/ExitPlanModeTool/constants.js'
import { TASK_OUTPUT_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/TaskOutputTool/constants.js'
import type { Message } from '../types/message.js'
import { isAgentSwarmsEnabled } from './agentSwarmsEnabled.js'
import {
  modelSupportsStructuredOutputs,
  shouldUseGlobalCacheScope,
} from './betas.js'
import { getCwd } from './cwd.js'
import { logForDebugging } from './debug.js'
import { isEnvTruthy } from './envUtils.js'
import { createUserMessage } from './messages.js'
import {
  getAPIProvider,
  isFirstPartyAnthropicBaseUrl,
} from './model/providers.js'
import {
  getFileReadIgnorePatterns,
  normalizePatternsToPath,
} from './permissions/filesystem.js'
import {
  getPlan,
  getPlanFilePath,
  persistFileSnapshotIfRemote,
} from './plans.js'
import { getPlatform } from './platform.js'
import { countFilesRoundedRg } from './ripgrep.js'
import { jsonStringify } from './slowOperations.js'
import type { SystemPrompt } from './systemPromptType.js'
import { getToolSchemaCache } from './toolSchemaCache.js'
import { windowsPathToPosixPath } from './windowsPaths.js'
import { zodToJsonSchema } from './zodToJsonSchema.js'

// 扩展 BetaTool 类型，支持严格模式和延迟加载
type BetaToolWithExtras = BetaTool & {
  strict?: boolean
  defer_loading?: boolean
  cache_control?: {
    type: 'ephemeral'
    scope?: 'global' | 'org'
    ttl?: '5m' | '1h'
  }
  eager_input_streaming?: boolean
}

export type CacheScope = 'global' | 'org'
export type SystemPromptBlock = {
  text: string
  cacheScope: CacheScope | null
}

// 当集群功能未启用时，从工具模式中过滤掉的字段
const SWARM_FIELDS_BY_TOOL: Record<string, string[]> = {
  [EXIT_PLAN_MODE_V2_TOOL_NAME]: ['launchSwarm', 'teammateCount'],
  [AGENT_TOOL_NAME]: ['name', 'team_name', 'mode'],
}

/** * 从工具的输入模式中过滤掉与集群相关的字段。
 * 当 isAgentSwarmsEnabled() 返回 false 时，在运行时调用。 */
function filterSwarmFieldsFromSchema(
  toolName: string,
  schema: Anthropic.Tool.InputSchema,
): Anthropic.Tool.InputSchema {
  const fieldsToRemove = SWARM_FIELDS_BY_TOOL[toolName]
  if (!fieldsToRemove || fieldsToRemove.length === 0) {
    return schema
  }

  // 克隆模式以避免修改原始数据
  const filtered = { ...schema }
  const props = filtered.properties
  if (props && typeof props === 'object') {
    const filteredProps = { ...(props as Record<string, unknown>) }
    for (const field of fieldsToRemove) {
      delete filteredProps[field]
    }
    filtered.properties = filteredProps
  }

  return filtered
}

export async function toolToAPISchema(
  tool: Tool,
  options: {
    getToolPermissionContext: () => Promise<ToolPermissionContext>
    tools: Tools
    agents: AgentDefinition[]
    allowedAgentTypes?: string[]
    model?: string
    /** 为 true 时，为此工具标记 defer_loading 以用于工具搜索 */
    deferLoading?: boolean
    cacheControl?: {
      type: 'ephemeral'
      scope?: 'global' | 'org'
      ttl?: '5m' | '1h'
    }
  },
): Promise<BetaToolUnion> {
  // 会话稳定的基础模式：名称、描述、输入模式、严格模式、急切输入流。这些
  // 在每次会话中计算一次并缓存，以防止会话中途的 GrowthBook 切换
  // （tengu_tool_pear, tengu_fgts）或 tool
  // .prompt() 漂移导致序列化工具数组字节的剧烈变化。原理参见
  // toolSchemaCache.ts。
  //
  // 缓存键包含 inputJSONSchema（如果存在）。StructuredOutp
  // ut 实例共享名称 'StructuredOutput'，但每个工作流调用携带不同
  // 的模式——仅基于名称的键控会返回过时的模式（错误率从 5.4% 升至 51%，参见
  // PR#25424）。MCP 工具也设置 inputJSONSchema，但每个都有
  // 稳定的模式，因此包含它可以保持它们 GB 切换的缓存稳定性。
  const cacheKey =
    'inputJSONSchema' in tool && tool.inputJSONSchema
      ? `${tool.name}:${jsonStringify(tool.inputJSONSchema)}`
      : tool.name
  const cache = getToolSchemaCache()
  let base = cache.get(cacheKey)
  if (!base) {
    const strictToolsEnabled =
      checkStatsigFeatureGate_CACHED_MAY_BE_STALE('tengu_tool_pear')
    // 如果提供了工具的 JSON 模式则直接使用，否则转换 Zod 模式
    let input_schema = (
      'inputJSONSchema' in tool && tool.inputJSONSchema
        ? tool.inputJSONSchema
        : zodToJsonSchema(tool.inputSchema)
    ) as Anthropic.Tool.InputSchema

    // 当集群未启用时，过滤掉与集群相关的字段。
    // 这确保外部非 EAP 用户在模式中看不到集群功能
    if (!isAgentSwarmsEnabled()) {
      input_schema = filterSwarmFieldsFromSchema(tool.name, input_schema)
    }

    base = {
      name: tool.name,
      description: await tool.prompt({
        getToolPermissionContext: options.getToolPermissionContext,
        tools: options.tools,
        agents: options.agents,
        allowedAgentTypes: options.allowedAgentTypes,
      }),
      input_schema,
    }

    // 仅在以下情况下添加
    // 严格模式：1. 功能标志已
    // 启用 2. 工具设置了
    // strict: true 3. 提供了模型且模型支持该功能（并非所有模型
    // 目前都支持）（如果未提供模型，则假定无法使用严格模式工具）
    if (
      strictToolsEnabled &&
      tool.strict === true &&
      options.model &&
      modelSupportsStructuredOutputs(options.model)
    ) {
      base.strict = true
    }

    // 通过每个工具的 API 字段启用细粒度工具流。没有 FGTS 时，A
    // PI 在发送 input_json_delta 事件之前会缓冲整个工具输入参数，导致大
    // 型工具输入时出现数分钟的挂起。此功能仅限于直接 api.anthropic.com：代
    // 理（LiteLLM 等）以及使用 Claude 4.5 的 Bedrock/Vertex
    // 会因 400 错误拒绝此字段。参见 GH#32742, PR #21729。
    if (
      getAPIProvider() === 'firstParty' &&
      isFirstPartyAnthropicBaseUrl() &&
      (getFeatureValue_CACHED_MAY_BE_STALE('tengu_fgts', false) ||
        isEnvTruthy(process.env.CLAUDE_CODE_ENABLE_FINE_GRAINED_TOOL_STREAMING))
    ) {
      base.eager_input_streaming = true
    }

    cache.set(cacheKey, base)
  }

  // 每次请求的覆盖层：defer_loading 和 cache_con
  // trol 因调用而异（工具搜索每轮延迟不同的工具；缓存标记会移动）。
  // 显式字段复制可避免修改缓存的基础数据，并规避 BetaTool.ca
  // che_control 的 `| null` 与我们更窄的类型冲突。
  const schema: BetaToolWithExtras = {
    name: base.name,
    description: base.description,
    input_schema: base.input_schema,
    ...(base.strict && { strict: true }),
    ...(base.eager_input_streaming && { eager_input_streaming: true }),
  }

  // 如果请求，则添加 defer_loading（用于工具搜索功能）
  if (options.deferLoading) {
    schema.defer_loading = true
  }

  if (options.cacheControl) {
    schema.cache_control = options.cacheControl
  }

  // CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS
  // 是用于实验性 API 形态的紧急关闭开关。代理网关（ANTHROPIC_B
  // ASE_URL → LiteLLM → Bedrock）会拒绝像 defer_lo
  // ading 这样的字段，并提示“不允许额外的输入”。每个字段上方的开关是分散的，
  // 并且并非所有都感知提供商，因此这会在所有工具模式都必须经过的唯一瓶颈点，剥离不在
  // 基础工具允许列表中的所有内容——包括未来添加的字段。cache_c
  // ontrol 在允许列表中：基础形态 {type: 'ephemeral'
  // } 是标准提示缓存（Bedrock/Vertex 支持）；实验性子字段（sco
  // pe, ttl）已在上游由 shouldIncludeFirstPartyOnly
  // Betas 控制，该函数独立地遵守此紧急关闭开关。
  // github.com/anthropics/claude-code/issues/20031
  if (isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS)) {
    const allowed = new Set([
      'name',
      'description',
      'input_schema',
      'cache_control',
    ])
    const stripped = Object.keys(schema).filter(k => !allowed.has(k))
    if (stripped.length > 0) {
      logStripOnce(stripped)
      return {
        name: schema.name,
        description: schema.description,
        input_schema: schema.input_schema,
        ...(schema.cache_control && { cache_control: schema.cache_control }),
      }
    }
  }

  // 注意：我们强制转换为 BetaTool，但额外的字段在运行时仍然
  // 存在，并且会在 API 请求中被序列化，即使它们不在 SDK 的
  // BetaTool 类型定义中。这对于实验性功能是故意的。
  return schema as BetaTool
}

let loggedStrip = false
function logStripOnce(stripped: string[]): void {
  if (loggedStrip) return
  loggedStrip = true
  logForDebugging(
    `[实验性功能] 已从工具模式中剥离：[${stripped.join(', ')}] (CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1)`,
  )
}

/**
 * 记录第一个块的统计信息，用于分析前缀匹配配置
 * (see https://console.statsig.com/4aF3Ewatb6xPVpCwxb5nA3/dynamic_configs/claude_cli_system_prompt_prefixes)
 */
export function logAPIPrefix(systemPrompt: SystemPrompt): void {
  const [firstSyspromptBlock] = splitSysPromptPrefix(systemPrompt)
  const firstSystemPrompt = firstSyspromptBlock?.text
  logEvent('tengu_sysprompt_block', {
    snippet: firstSystemPrompt?.slice(
      0,
      20,
    ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    length: firstSystemPrompt?.length ?? 0,
    hash: (firstSystemPrompt
      ? createHash('sha256').update(firstSystemPrompt).digest('hex')
      : '') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })
}
/**
 * 根据内容类型拆分系统提示块，用于 API 匹配和缓存控制。
 * 参见 https://console.statsig.com/4aF3Ewatb6xPVpCwxb5nA3/dynamic_configs/claude_cli_system_prompt_prefixes
 *
 * 行为取决于功能标志和选项：
 *
 * 1. 存在 MCP 工具（skipGlobalCacheForSystemPrompt=true）：
 *    返回最多 3 个块，使用组织级缓存（系统提示上没有全局缓存）：
 *    - 归因头部（cacheScope=null）
 *    - 系统提示前缀（cacheScope='org'）
 *    - 其他所有内容拼接（cacheScope='org'）
 *
 * 2. 带边界标记的全局缓存模式（仅限第一方，找到边界）：
 *    返回最多 4 个块：
 *    - 归因头部（cacheScope=null）
 *    - 系统提示前缀（cacheScope=null）
 *    - 边界前的静态内容（cacheScope='global'）
 *    - 边界后的动态内容（cacheScope=null）
 *
 * 3. 默认模式（第三方提供者，或边界缺失）：
 *    返回最多 3 个块，使用组织级缓存：
 *    - 归因头部（cacheScope=null）
 *    - 系统提示前缀（cacheScope='org'）
 *    - 其他所有内容拼接（cacheScope='org'）
 * 
 * 把SystemPrompt分成N份，根据不同情况标记缓存类别：
 * **CacheScope == 'global' 表示全局缓存。CacheScope == 'org' 表示组织级缓存。CacheScope == null 表示不缓存。**
 */
export function splitSysPromptPrefix(
  systemPrompt: SystemPrompt,
  options?: { skipGlobalCacheForSystemPrompt?: boolean },
): SystemPromptBlock[] {
  const useGlobalCacheFeature = shouldUseGlobalCacheScope()
  //使用官方模型，且存在需要动态加载的MCP工具。
  if (useGlobalCacheFeature && options?.skipGlobalCacheForSystemPrompt) {
    logEvent('tengu_sysprompt_using_tool_based_cache', {
      promptBlockCount: systemPrompt.length,
    })

    // 过滤掉边界标记，返回没有全局作用域的代码块
    let attributionHeader: string | undefined
    let systemPromptPrefix: string | undefined
    const rest: string[] = []

    for (const prompt of systemPrompt) {
      if (!prompt) continue
      if (prompt === SYSTEM_PROMPT_DYNAMIC_BOUNDARY) continue // Skip boundary
      if (prompt.startsWith('x-anthropic-billing-header')) {
        attributionHeader = prompt
      } else if (CLI_SYSPROMPT_PREFIXES.has(prompt)) {
        systemPromptPrefix = prompt
      } else {
        rest.push(prompt)
      }
    }

    const result: SystemPromptBlock[] = []
    if (attributionHeader) {
      result.push({ text: attributionHeader, cacheScope: null })
    }
    if (systemPromptPrefix) {
      result.push({ text: systemPromptPrefix, cacheScope: 'org' })
    }
    const restJoined = rest.join('\n\n')
    if (restJoined) {
      result.push({ text: restJoined, cacheScope: 'org' })
    }
    return result
  }
  //使用官方模型，且存在动态边界标记。
  if (useGlobalCacheFeature) {
    const boundaryIndex = systemPrompt.indexOf(SYSTEM_PROMPT_DYNAMIC_BOUNDARY)
    if (boundaryIndex !== -1) {
      let attributionHeader: string | undefined
      let systemPromptPrefix: string | undefined
      const staticBlocks: string[] = []
      const dynamicBlocks: string[] = []

      for (let i = 0; i < systemPrompt.length; i++) {
        const block = systemPrompt[i]
        if (!block || block === SYSTEM_PROMPT_DYNAMIC_BOUNDARY) continue

        if (block.startsWith('x-anthropic-billing-header')) {
          attributionHeader = block
        } else if (CLI_SYSPROMPT_PREFIXES.has(block)) {
          systemPromptPrefix = block
        } else if (i < boundaryIndex) {
          staticBlocks.push(block)
        } else {
          dynamicBlocks.push(block)
        }
      }

      const result: SystemPromptBlock[] = []
      if (attributionHeader)
        result.push({ text: attributionHeader, cacheScope: null })
      if (systemPromptPrefix)
        result.push({ text: systemPromptPrefix, cacheScope: null })
      const staticJoined = staticBlocks.join('\n\n')
      if (staticJoined)
        result.push({ text: staticJoined, cacheScope: 'global' })
      const dynamicJoined = dynamicBlocks.join('\n\n')
      if (dynamicJoined) result.push({ text: dynamicJoined, cacheScope: null })

      logEvent('tengu_sysprompt_boundary_found', {
        blockCount: result.length,
        staticBlockLength: staticJoined.length,
        dynamicBlockLength: dynamicJoined.length,
      })

      return result
    } else {
      logEvent('tengu_sysprompt_missing_boundary_marker', {
        promptBlockCount: systemPrompt.length,
      })
    }
  }
  //第三方模型，不存在动态边界标记。
  let attributionHeader: string | undefined
  let systemPromptPrefix: string | undefined
  const rest: string[] = []

  for (const block of systemPrompt) {
    if (!block) continue

    if (block.startsWith('x-anthropic-billing-header')) {
      attributionHeader = block
    } else if (CLI_SYSPROMPT_PREFIXES.has(block)) {
      systemPromptPrefix = block
    } else {
      rest.push(block)
    }
  }

  const result: SystemPromptBlock[] = []
  if (attributionHeader)
    result.push({ text: attributionHeader, cacheScope: null })
  if (systemPromptPrefix)
    result.push({ text: systemPromptPrefix, cacheScope: 'org' })
  const restJoined = rest.join('\n\n')
  if (restJoined) result.push({ text: restJoined, cacheScope: 'org' })
  return result
}

export function appendSystemContext(
  systemPrompt: SystemPrompt,
  context: { [k: string]: string },
): string[] {
  return [
    ...systemPrompt,
    Object.entries(context)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n'),
  ].filter(Boolean)
}

export function prependUserContext(
  messages: Message[],
  context: { [k: string]: string },
): Message[] {
  if (process.env.NODE_ENV === 'test') {
    return messages
  }

  if (Object.entries(context).length === 0) {
    return messages
  }

  return [
    createUserMessage({
      content: `<system-reminder>
在回答用户问题时，你可以使用以下上下文：
${Object.entries(
        context,
      )
        .map(([key, value]) => `# ${key}\n${value}`)
        .join('\n')}

      重要提示：此上下文可能与你的任务相关，也可能不相关。除非与你的任务高度相关，否则不应回应此上下文。
</system-reminder>
`,
      isMeta: true,
    }),
    ...messages,
  ]
}

/** * 记录关于上下文和系统提示大小的指标 */
export async function logContextMetrics(
  mcpConfigs: Record<string, ScopedMcpServerConfig>,
  toolPermissionContext: ToolPermissionContext,
): Promise<void> {
  // 如果日志记录已禁用，则提前返回
  if (isAnalyticsDisabled()) {
    return
  }
  const [{ tools: mcpTools }, tools, userContext, systemContext] =
    await Promise.all([
      prefetchAllMcpResources(mcpConfigs),
      getTools(toolPermissionContext),
      getUserContext(),
      getSystemContext(),
    ])
  // 提取各个上下文大小并计算总量
  const gitStatusSize = systemContext.gitStatus?.length ?? 0
  const claudeMdSize = userContext.claudeMd?.length ?? 0

  // 计算总上下文大小
  const totalContextSize = gitStatusSize + claudeMdSize

  // 使用 ripgrep 获取文件数量（为保护隐私，四舍五入到最接近的 10 的幂）
  const currentDir = getCwd()
  const ignorePatternsByRoot = getFileReadIgnorePatterns(toolPermissionContext)
  const normalizedIgnorePatterns = normalizePatternsToPath(
    ignorePatternsByRoot,
    currentDir,
  )
  const fileCount = await countFilesRoundedRg(
    currentDir,
    AbortSignal.timeout(1000),
    normalizedIgnorePatterns,
  )

  // 计算工具指标
  let mcpToolsCount = 0
  let mcpServersCount = 0
  let mcpToolsTokens = 0
  let nonMcpToolsCount = 0
  let nonMcpToolsTokens = 0

  const nonMcpTools = tools.filter(tool => !tool.isMcp)
  mcpToolsCount = mcpTools.length
  nonMcpToolsCount = nonMcpTools.length

  // 从 MCP 工具名称中提取唯一的服务器名称（格式：mcp__servername__toolname）
  const serverNames = new Set<string>()
  for (const tool of mcpTools) {
    const parts = tool.name.split('__')
    if (parts.length >= 3 && parts[1]) {
      serverNames.add(parts[1])
    }
  }
  mcpServersCount = serverNames.size

  // 在本地估算工具令牌数用于分析（避免每次会话进行 N 次 API 调用）。如果可
  // 用，使用 inputJSONSchema（纯 JSON 模式），否则转换 Zod 模式
  for (const tool of mcpTools) {
    const schema =
      'inputJSONSchema' in tool && tool.inputJSONSchema
        ? tool.inputJSONSchema
        : zodToJsonSchema(tool.inputSchema)
    mcpToolsTokens += roughTokenCountEstimation(jsonStringify(schema))
  }
  for (const tool of nonMcpTools) {
    const schema =
      'inputJSONSchema' in tool && tool.inputJSONSchema
        ? tool.inputJSONSchema
        : zodToJsonSchema(tool.inputSchema)
    nonMcpToolsTokens += roughTokenCountEstimation(jsonStringify(schema))
  }

  logEvent('tengu_context_size', {
    git_status_size: gitStatusSize,
    claude_md_size: claudeMdSize,
    total_context_size: totalContextSize,
    project_file_count_rounded: fileCount,
    mcp_tools_count: mcpToolsCount,
    mcp_servers_count: mcpServersCount,
    mcp_tools_tokens: mcpToolsTokens,
    non_mcp_tools_count: nonMcpToolsCount,
    non_mcp_tools_tokens: nonMcpToolsTokens,
  })
}

// 待办事项：将此功能通用化到所有工具
export function normalizeToolInput<T extends Tool>(
  tool: T,
  input: z.infer<T['inputSchema']>,
  agentId?: AgentId,
): z.infer<T['inputSchema']> {
  switch (tool.name) {
    case EXIT_PLAN_MODE_V2_TOOL_NAME: {
      // 始终为 ExitPlanModeV2 注入计划内容和文件路径，以便钩子/SDK
      // 获取计划。V2 工具从文件而非输入中读取计划，但钩子/SDK
      const plan = getPlan(agentId)
      const planFilePath = getPlanFilePath(agentId)
      // 为 CCR 会话持久化文件快照，以便计划在 Pod 回收后得以保留
      void persistFileSnapshotIfRemote()
      return plan !== null ? { ...input, plan, planFilePath } : input
    }
    case BashTool.name: {
      // 已在上游验证，不会抛出异常
      const parsed = BashTool.inputSchema.parse(input)
      const { command, timeout, description } = parsed
      const cwd = getCwd()
      let normalizedCommand = command.replace(`cd ${cwd} && `, '')
      if (getPlatform() === 'windows') {
        normalizedCommand = normalizedCommand.replace(
          `cd ${windowsPathToPosixPath(cwd)} && `,
          '',
        )
      }

      // 将 \\; 替换为 \;（通常用于 find -exec 命令）
      normalizedCommand = normalizedCommand.replace(/\\\\;/g, '\\;')

      // 记录仅输出字符串的命令日志。这有助于我们了解 Claude 通过 bash 进行交互的频率
      if (/^echo\s+["']?[^|&;><]*["']?$/i.test(normalizedCommand.trim())) {
        logEvent('tengu_bash_tool_simple_echo', {})
      }

      // 检查 run_in_background（如果设置了 CLAUDE_CODE_DISABLE_BACKGROUND_TASKS，则 schema 中可能不存在）
      const run_in_background =
        'run_in_background' in parsed ? parsed.run_in_background : undefined

      // 安全性：类型转换是安全的，因为输入已通过上方的 .parse() 验证
      // 。TypeScript 无法根据 switch(tool.name) 缩小
      // 泛型 T 的范围，因此它不知道返回类型与 T['inputSchema'] 匹配
      // 。这是泛型在 TypeScript 中的根本限制，不进行重大重构无法绕过。
      return {
        command: normalizedCommand,
        description,
        ...(timeout !== undefined && { timeout }),
        ...(description !== undefined && { description }),
        ...(run_in_background !== undefined && { run_in_background }),
        ...('dangerouslyDisableSandbox' in parsed &&
          parsed.dangerouslyDisableSandbox !== undefined && {
            dangerouslyDisableSandbox: parsed.dangerouslyDisableSandbox,
          }),
      } as z.infer<T['inputSchema']>
    }
    case FileEditTool.name: {
      // 已在上游验证，不会抛出异常
      const parsedInput = FileEditTool.inputSchema.parse(input)

      // 这是针对 Claude 无法看到的令牌的变通方案
      const { file_path, edits } = normalizeFileEditInput({
        file_path: parsedInput.file_path,
        edits: [
          {
            old_string: parsedInput.old_string,
            new_string: parsedInput.new_string,
            replace_all: parsedInput.replace_all,
          },
        ],
      })

      // 安全性：请参考上方 BashTool 案例中的注释
      return {
        replace_all: edits[0]!.replace_all,
        file_path,
        old_string: edits[0]!.old_string,
        new_string: edits[0]!.new_string,
      } as z.infer<T['inputSchema']>
    }
    case FileWriteTool.name: {
      // 已在上游验证，不会抛出异常
      const parsedInput = FileWriteTool.inputSchema.parse(input)

      // Markdown 使用两个尾随空格表示硬换行——不要移除它们。
      const isMarkdown = /\.(md|mdx)$/i.test(parsedInput.file_path)

      // 安全性：请参考上方 BashTool 案例中的注释
      return {
        file_path: parsedInput.file_path,
        content: isMarkdown
          ? parsedInput.content
          : stripTrailingWhitespace(parsedInput.content),
      } as z.infer<T['inputSchema']>
    }
    case TASK_OUTPUT_TOOL_NAME: {
      // 规范化来自 AgentOutputTool/BashOutputTool 的旧参数名称
      const legacyInput = input as Record<string, unknown>
      const taskId =
        legacyInput.task_id ?? legacyInput.agentId ?? legacyInput.bash_id
      const timeout =
        legacyInput.timeout ??
        (typeof legacyInput.wait_up_to === 'number'
          ? legacyInput.wait_up_to * 1000
          : undefined)
      // 安全性：请参考上方 BashTool 案例中的注释
      return {
        task_id: taskId ?? '',
        block: legacyInput.block ?? true,
        timeout: timeout ?? 30000,
      } as z.infer<T['inputSchema']>
    }
    default:
      return input
  }
}

// 在发送到 API 之前，移除由 normalizeToolInput 添加的字段（例如，
// 来自 ExitPlanModeV2 的 plan 字段，其输入 schema 为空）
export function normalizeToolInputForAPI<T extends Tool>(
  tool: T,
  input: z.infer<T['inputSchema']>,
): z.infer<T['inputSchema']> {
  switch (tool.name) {
    case EXIT_PLAN_MODE_V2_TOOL_NAME: {
      // 在发送到 API 之前移除注入的字段（schema 期望空对象）
      if (
        input &&
        typeof input === 'object' &&
        ('plan' in input || 'planFilePath' in input)
      ) {
        const { plan, planFilePath, ...rest } = input as Record<string, unknown>
        return rest as z.infer<T['inputSchema']>
      }
      return input
    }
    case FileEditTool.name: {
      // 从 PR #20357 之前写入的旧会话记录恢复的旧会话中，移除合成的 o
      // ld_string/new_string/replace_all 字段。在
      // PR #20357 之前，normalizeToolInput 曾合成这些
      // 字段。这是必需的，以便旧的 --resume 会话记录不会将整个文件副本
      // 发送到 API。新会话不需要此操作（合成已移至发射时）。
      if (input && typeof input === 'object' && 'edits' in input) {
        const { old_string, new_string, replace_all, ...rest } =
          input as Record<string, unknown>
        return rest as z.infer<T['inputSchema']>
      }
      return input
    }
    default:
      return input
  }
}
