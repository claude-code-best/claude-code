import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import type { UUID } from 'crypto'
import type { CanUseToolFn } from '../hooks/useCanUseTool.js'
import type { CompactionResult } from '../services/compact/compact.js'
import type { ScopedMcpServerConfig } from '../services/mcp/types.js'
import type { ToolUseContext } from '../Tool.js'
import type { EffortValue } from '../utils/effort.js'
import type { IDEExtensionInstallationStatus, IdeType } from '../utils/ide.js'
import type { SettingSource } from '../utils/settings/constants.js'
import type { HooksSettings } from '../utils/settings/types.js'
import type { ThemeName } from '../utils/theme.js'
import type { LogOption } from './logs.js'
import type { Message } from './message.js'
import type { PluginManifest } from './plugin.js'

export type LocalCommandResult =
  | { type: 'text'; value: string }
  | {
      type: 'compact'
      compactionResult: CompactionResult
      displayText?: string
    }
  | { type: 'skip' } // 跳过消息

export type PromptCommand = {
  type: 'prompt'
  progressMessage: string
  contentLength: number // 命令内容的字符长度（用于估算令牌数）
  argNames?: string[]
  allowedTools?: string[]
  model?: string
  source: SettingSource | 'builtin' | 'mcp' | 'plugin' | 'bundled'//builtin是写在commands/目录下type为prompt的命令；bundled是写在内置技能，通过bundledSkills.ts构建。
  pluginInfo?: {
    pluginManifest: PluginManifest
    repository: string
  }
  disableNonInteractive?: boolean
  // 调用此技能时要注册的钩子
  hooks?: HooksSettings
  // 技能资源的基础目录（用于为技能钩子设置 CLAUDE_PLUGIN_ROOT 环境变量）
  skillRoot?: string
  // 执行上下文：'inline'（默认）或 'fork'（作为子
  // 代理运行） 'inline' = 技能内容扩展到当前对话
  // 中 'fork' = 技能在具有独立上下文和令牌预算的子代理中运行
  context?: 'inline' | 'fork'
  // 分叉时使用的代理类型（例如，'Bash'、'general-purpos
  // e'） 仅当上下文为 'fork' 时适用
  agent?: string
  effort?: EffortValue
  // 此技能适用的文件路径通配符模式
  // 设置后，只有在模型触及匹配的文件后，该技能才可见
  paths?: string[]
  getPromptForCommand(
    args: string,
    context: ToolUseContext,
  ): Promise<ContentBlockParam[]>
}

/** 本地命令实现的调用签名。 */
export type LocalCommandCall = (
  args: string,
  context: LocalJSXCommandContext,
) => Promise<LocalCommandResult>

/** 延迟加载的本地命令由 load() 返回的模块结构。 */
export type LocalCommandModule = {
  call: LocalCommandCall
}

type LocalCommand = {
  type: 'local'
  supportsNonInteractive: boolean
  load: () => Promise<LocalCommandModule>
}

export type LocalJSXCommandContext = ToolUseContext & {
  canUseTool?: CanUseToolFn
  setMessages: (updater: (prev: Message[]) => Message[]) => void
  options: {
    dynamicMcpConfig?: Record<string, ScopedMcpServerConfig>
    ideInstallationStatus: IDEExtensionInstallationStatus | null
    theme: ThemeName
  }
  onChangeAPIKey: () => void
  onChangeDynamicMcpConfig?: (
    config: Record<string, ScopedMcpServerConfig>,
  ) => void
  onInstallIDEExtension?: (ide: IdeType) => void
  resume?: (
    sessionId: UUID,
    log: LogOption,
    entrypoint: ResumeEntrypoint,
  ) => Promise<void>
}

export type ResumeEntrypoint =
  | 'cli_flag'
  | 'slash_command_picker'
  | 'slash_command_session_id'
  | 'slash_command_title'
  | 'fork'

export type CommandResultDisplay = 'skip' | 'system' | 'user'

/** 命令完成时的回调。
@param result - 可选的要显示给用户的消息
@param options - 命令完成的可选配置
@param options.display - 结果显示方式：'skip' | 'system' | 'user'（默认）
@param options.shouldQuery - 如果为 true，命令完成后向模型发送消息
@param options.metaMessages - 要作为 isMeta 插入的额外消息（模型可见但隐藏） */
export type LocalJSXCommandOnDone = (
  result?: string,
  options?: {
    display?: CommandResultDisplay
    shouldQuery?: boolean
    metaMessages?: string[]
    nextInput?: string
    submitNextInput?: boolean
  },
) => void

/** 本地 JSX 命令实现的调用签名。 */
export type LocalJSXCommandCall = (
  onDone: LocalJSXCommandOnDone,
  context: ToolUseContext & LocalJSXCommandContext,
  args: string,
) => Promise<React.ReactNode>

/** 延迟加载的命令由 load() 返回的模块结构。 */
export type LocalJSXCommandModule = {
  call: LocalJSXCommandCall
}

type LocalJSXCommand = {
  type: 'local-jsx'
  /** 延迟加载命令实现。
返回一个带有 call() 函数的模块。
这将推迟加载重型依赖项，直到命令被调用时。 */
  load: () => Promise<LocalJSXCommandModule>
}

/** 声明命令在哪些认证/提供商环境中可用。

这与 `isEnabled()` 是分开的：
  - `availability` = 谁可以使用此命令（认证/提供商要求，静态）
  - `isEnabled()`  = 此命令当前是否启用（GrowthBook、平台、环境变量）

没有 `availability` 的命令在所有地方都可用。
有 `availability` 的命令只有在用户至少匹配所列认证类型之一时才显示。请参阅 commands.ts 中的 meetsAvailabilityRequirement()。

示例：`availability: ['claude-ai', 'console']` 向 claude.ai 订阅者和直接 Console API 密钥用户（api.anthropic.com）显示该命令，
但对 Bedrock/Vertex/Foundry 用户和自定义基础 URL 用户隐藏。 */
export type CommandAvailability =
  // claude.ai OAuth 订阅者（通过 claude.ai 的 Pro/Max/Team/Enterprise 用户）
  | 'claude-ai'
  // Console API 密钥用户（直接使用 api.anthropic.com，而非通过 claude.ai OAuth）
  | 'console'

export type CommandBase = {
  availability?: CommandAvailability[]
  /** 允许本地/local-jsx 命令在通过远程控制桥接器到达时执行。仅用于不需要本地交互式 Ink UI 且可以安全地无头完成的命令。 */
  bridgeSafe?: boolean
  /** 对通过桥接器传递的斜杠命令的可选每次调用验证。
当特定参数在远程控制上无头运行不安全时，返回面向用户的拒绝原因。 */
  getBridgeInvocationError?: (args: string) => string | undefined
  description: string
  hasUserSpecifiedDescription?: boolean
  /** 默认为 true。仅在命令有条件启用（功能标志、环境检查等）时设置。 */
  isEnabled?: () => boolean
  /** 默认为 false。仅在命令应从类型提示/帮助中隐藏时设置。 */
  isHidden?: boolean
  name: string
  aliases?: string[]
  isMcp?: boolean
  argumentHint?: string // 命令参数的提示文本（以灰色显示在命令后）
  whenToUse?: string // 来自“技能”规范。关于何时使用此命令的详细使用场景
  version?: string // 命令/技能的版本
  disableModelInvocation?: boolean // 是否禁止模型调用此命令
  userInvocable?: boolean // 用户是否可以通过输入 /skill-name 来调用此技能
  loadedFrom?:
    | 'commands_DEPRECATED'
    | 'skills'
    | 'plugin'
    | 'managed'
    | 'bundled'
    | 'mcp' // 命令的加载来源
  kind?: 'workflow' // 区分由工作流支持的命令（在自动完成中带有徽章）
  immediate?: boolean // 如果为 true，命令立即执行，无需等待停止点（绕过队列）
  isSensitive?: boolean // 如果为 true，参数将从对话历史记录中编辑掉
  /** 默认为 `name`。仅在显示名称不同时覆盖（例如，插件前缀剥离）。 */
  userFacingName?: () => string
}

export type Command = CommandBase &
  (PromptCommand | LocalCommand | LocalJSXCommand)

/** 解析用户可见的名称，当未覆盖时回退到 `cmd.name`。 */
export function getCommandName(cmd: CommandBase): string {
  const name = cmd.userFacingName?.() ?? cmd.name
  return name || ''
}

/** 解析命令是否启用，默认为 true。 */
export function isCommandEnabled(cmd: CommandBase): boolean {
  return cmd.isEnabled?.() ?? true
}
