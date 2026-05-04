import { feature } from 'bun:bundle'
import { z } from 'zod/v4'
import { SandboxSettingsSchema } from '../../entrypoints/sandboxTypes.js'
import { isEnvTruthy } from '../envUtils.js'
import { lazySchema } from '../lazySchema.js'
import {
  EXTERNAL_PERMISSION_MODES,
  PERMISSION_MODES,
} from '../permissions/PermissionMode.js'
import { MarketplaceSourceSchema } from '../plugins/schemas.js'
import { CLAUDE_CODE_SETTINGS_SCHEMA_URL } from './constants.js'
import { PermissionRuleSchema } from './permissionValidation.js'

// 从集中位置重新导出钩子模式和类型，以保持向后兼容性
export {
  type AgentHook,
  type BashCommandHook,
  type HookCommand,
  HookCommandSchema,
  type HookMatcher,
  HookMatcherSchema,
  HooksSchema,
  type HooksSettings,
  type HttpHook,
  type PromptHook,
} from '../../schemas/hooks.js'

// 同时导入供本文件内部使用
import { type HookCommand, HooksSchema } from '../../schemas/hooks.js'
import { count } from '../array.js'

/** 环境变量模式 */
export const EnvironmentVariablesSchema = lazySchema(() =>
  z.record(z.string(), z.coerce.string()),
)

/** 权限部分模式 */
export const PermissionsSchema = lazySchema(() =>
  z
    .object({
      allow: z
        .array(PermissionRuleSchema())
        .optional()
        .describe('允许操作的权限规则列表'),
      deny: z
        .array(PermissionRuleSchema())
        .optional()
        .describe('拒绝操作的权限规则列表'),
      ask: z
        .array(PermissionRuleSchema())
        .optional()
        .describe('应始终提示确认的权限规则列表'),
      defaultMode: z
        .enum(PERMISSION_MODES)
        .optional()
        .describe('当 Claude Code 需要访问时的默认权限模式'),
      disableBypassPermissionsMode: z
        .enum(['disable'])
        .optional()
        .describe('禁用绕过权限提示的能力'),
      ...(feature('TRANSCRIPT_CLASSIFIER')
        ? {
            disableAutoMode: z
              .enum(['disable'])
              .optional()
              .describe('禁用自动模式'),
          }
        : {}),
      additionalDirectories: z
        .array(z.string())
        .optional()
        .describe('要包含在权限范围内的额外目录'),
    })
    .passthrough(),
)

/** 仓库设置中定义的额外市场模式
与 KnownMarketplace 相同，但没有 lastUpdated（该字段由系统自动管理） */
export const ExtraKnownMarketplaceSchema = lazySchema(() =>
  z.object({
    source: MarketplaceSourceSchema().describe('从何处获取市场'),
    installLocation: z
      .string()
      .optional()
      .describe('存储市场清单的本地缓存路径（如果未提供则自动生成）'),
    autoUpdate: z
      .boolean()
      .optional()
      .describe('是否在启动时自动更新此市场及其已安装的插件'),
  }),
)

/** 企业允许列表中允许的 MCP 服务器条目模式。
支持按 serverName、serverCommand 或 serverUrl 匹配（互斥）。 */
export const AllowedMcpServerEntrySchema = lazySchema(() =>
  z
    .object({
      serverName: z
        .string()
        .regex(
          /^[a-zA-Z0-9_-]+$/,
          '服务器名称只能包含字母、数字、连字符和下划线',
        )
        .optional()
        .describe('允许用户配置的 MCP 服务器名称'),
      serverCommand: z
        .array(z.string())
        .min(1, '服务器命令必须至少有一个元素（命令本身）')
        .optional()
        .describe(
          '用于精确匹配允许的 stdio 服务器的命令数组 [command, ...args]',
        ),
      serverUrl: z
        .string()
        .optional()
        .describe(
          '支持通配符的 URL 模式（例如 "https://*.example.com/*"），用于允许的远程 MCP 服务器',
        ),
      // 未来可扩展性：allowedTransports、requiredArgs、maxInstances 等
    })
    .refine(
      data => {
        const defined = count(
          [
            data.serverName !== undefined,
            data.serverCommand !== undefined,
            data.serverUrl !== undefined,
          ],
          Boolean,
        )
        return defined === 1
      },
      {
        message:
          '条目必须恰好包含 "serverName"、"serverCommand" 或 "serverUrl" 中的一个',
      },
    ),
)

/** 企业拒绝列表中拒绝的 MCP 服务器条目模式。
支持按 serverName、serverCommand 或 serverUrl 匹配（互斥）。 */
export const DeniedMcpServerEntrySchema = lazySchema(() =>
  z
    .object({
      serverName: z
        .string()
        .regex(
          /^[a-zA-Z0-9_-]+$/,
          '服务器名称只能包含字母、数字、连字符和下划线',
        )
        .optional()
        .describe('被明确阻止的 MCP 服务器名称'),
      serverCommand: z
        .array(z.string())
        .min(1, '服务器命令必须至少有一个元素（命令本身）')
        .optional()
        .describe(
          '用于精确匹配被阻止的 stdio 服务器的命令数组 [command, ...args]',
        ),
      serverUrl: z
        .string()
        .optional()
        .describe(
          '支持通配符的 URL 模式（例如 "https://*.example.com/*"），用于阻止的远程 MCP 服务器',
        ),
      // 未来可扩展性：reason、blockedSince 等
    })
    .refine(
      data => {
        const defined = count(
          [
            data.serverName !== undefined,
            data.serverCommand !== undefined,
            data.serverUrl !== undefined,
          ],
          Boolean,
        )
        return defined === 1
      },
      {
        message:
          '条目必须包含且仅包含 "serverName"、"serverCommand" 或 "serverUrl" 中的一个',
      },
    ),
)

/** 配置文件统一架构

⚠️ 向后兼容性声明 ⚠️

此架构定义了用户配置文件 (.claude/settings.json) 的结构。
我们支持向后兼容的更改！具体规则如下：

✅ 允许的更改：
- 添加新的可选字段（始终使用 .optional()）
- 添加新的枚举值（保留现有值）
- 向对象添加新属性
- 放宽验证规则
- 使用联合类型进行渐进式迁移（例如，z.union([oldType, newType])）

❌ 应避免的破坏性更改：
- 删除字段（应标记为已弃用）
- 删除枚举值
- 将可选字段改为必填
- 使类型限制更严格
- 重命名字段但不保留旧名称

为确保向后兼容性：
1. 运行：npm run test:file -- test/utils/settings/backward-compatibility.test.ts
2. 如果测试失败，说明引入了破坏性更改
3. 添加新字段时，请向 BACKWARD_COMPATIBILITY_CONFIGS 添加测试

设置系统自动处理向后兼容性：
- 更新设置时，无效字段会保留在文件中（参见 settings.ts 第 233-249 行）
- 通过 z.coerce 进行类型强制转换（例如，环境变量将数字转换为字符串）
- .passthrough() 保留权限对象中的未知字段
- 无效设置不会被使用，但会保留在文件中供用户修复 */

/** 可通过 `strictPluginOnlyCustomization` 锁定的界面。导出此定义，以便架构预处理（下方）和运行时辅助工具 (pluginOnlyPolicy.ts) 共享单一事实来源。 */
export const CUSTOMIZATION_SURFACES = [
  'skills',
  'agents',
  'hooks',
  'mcp',
] as const

export const SettingsSchema = lazySchema(() =>
  z
    .object({
      $schema: z
        .literal(CLAUDE_CODE_SETTINGS_SCHEMA_URL)
        .optional()
        .describe('Claude Code 设置的 JSON Schema 参考'),
      apiKeyHelper: z.string().optional().describe('输出身份验证值的脚本路径'),
      awsCredentialExport: z
        .string()
        .optional()
        .describe('导出 AWS 凭据的脚本路径'),
      awsAuthRefresh: z
        .string()
        .optional()
        .describe('刷新 AWS 身份验证的脚本路径'),
      gcpAuthRefresh: z
        .string()
        .optional()
        .describe(
          '刷新 GCP 身份验证的命令（例如，gcloud auth application-default login）',
        ),
      // 此配置受门控保护，以便 SDK 生成器（在没有 CLAUDE_CODE_ENABLE_XA
      // A 的环境下运行）不会在 GlobalClaudeSettings 中暴露此项。通过 getXa
      // aIdpSettings() 读取。外部对象上的 .passthrough() 确保现有的
      // settings.json 键在环境变量关闭的会话中保持存活——只是此时不进行架构验证。
      ...(isEnvTruthy(process.env.CLAUDE_CODE_ENABLE_XAA)
        ? {
            xaaIdp: z
              .object({
                issuer: z
                  .string()
                  .url()
                  .describe('用于 OIDC 发现的 IdP 颁发者 URL'),
                clientId: z
                  .string()
                  .describe('Claude Code 在 IdP 注册的 client_id'),
                callbackPort: z
                  .number()
                  .int()
                  .positive()
                  .optional()
                  .describe(
                    'IdP OIDC 登录的固定环回回调端口。' +
                      '仅在 IdP 不遵循 RFC 8252 端口任意匹配规则时需要。',
                  ),
              })
              .optional()
              .describe(
                'XAA (SEP-990) IdP 连接。一次性配置；所有启用 XAA 的 MCP 服务器都复用此配置。',
              ),
          }
        : {}),
      fileSuggestion: z
        .object({
          type: z.literal('command'),
          command: z.string(),
        })
        .optional()
        .describe('@ 提及的自定义文件建议配置'),
      respectGitignore: z
        .boolean()
        .optional()
        .describe(
          '文件选择器是否应遵循 .gitignore 文件（默认值：true）。' +
            '注意：.ignore 文件始终被遵循。',
        ),
      cleanupPeriodDays: z
        .number()
        .nonnegative()
        .int()
        .optional()
        .describe(
          '保留聊天记录的时长（天数，默认值：30）。设置为 0 将完全禁用会话持久化：不写入新记录，并在启动时删除现有记录。',
        ),
      env: EnvironmentVariablesSchema()
        .optional()
        .describe('为 Claude Code 会话设置的环境变量'),
      // 提交和 PR 的归属信息
      attribution: z
        .object({
          commit: z
            .string()
            .optional()
            .describe(
              'Git 提交的归属文本，可包含任何尾部信息。' +
                '空字符串将隐藏归属信息。',
            ),
          pr: z
            .string()
            .optional()
            .describe(
              'Pull Request 描述的归属文本。' + '空字符串将隐藏归属信息。',
            ),
        })
        .optional()
        .describe(
          '自定义提交和 PR 的归属文本。' +
            '每个字段若未设置，则默认为标准的 Claude Code 归属信息。',
        ),
      includeCoAuthoredBy: z
        .boolean()
        .optional()
        .describe(
          '已弃用：请改用 attribution。' +
            '是否在提交和 PR 中包含 Claude 的共同作者归属信息（默认为 true）',
        ),
      includeGitInstructions: z
        .boolean()
        .optional()
        .describe(
          '在 Claude 的系统提示中包含内置的提交和 PR 工作流说明（默认值：true）',
        ),
      permissions: PermissionsSchema().optional().describe('工具使用权限配置'),
      modelType: z
        .enum(['anthropic', 'openai', 'gemini', 'grok'])
        .optional()
        .describe(
          'API 提供商类型。"anthropic" 使用 Anthropic API（默认），"openai" 使用 OpenAI Chat Completions API，"gemini" 使用 Gemini API，"grok" 使用 xAI Grok API（兼容 OpenAI）。' +
            '当设置为 "openai" 时，配置 OPENAI_API_KEY、OPENAI_BASE_URL 和 OPENAI_MODEL。当设置为 "gemini" 时，配置 GEMINI_API_KEY 和可选的 GEMINI_BASE_URL。当设置为 "grok" 时，配置 GROK_API_KEY（或 XAI_API_KEY）、可选的 GROK_BASE_URL、GROK_MODEL 和 GROK_MODEL_MAP。',
        ),
      model: z.string().optional().describe('覆盖 Claude Code 使用的默认模型'),
      // 企业级模型白名单
      availableModels: z
        .array(z.string())
        .optional()
        .describe(
          '用户可选择的模型白名单。' +
            '接受系列别名（"opus" 允许任何 opus 版本）、' +
            '版本前缀（"opus-4-5" 仅允许该版本）、' +
            '以及完整的模型 ID。' +
            '如果未定义，则所有模型都可用。如果是空数组，则只有默认模型可用。' +
            '通常由企业管理员在托管设置中配置。',
        ),
      modelOverrides: z
        .record(z.string(), z.string())
        .optional()
        .describe(
          '覆盖从 Anthropic 模型 ID（例如 "claude-opus-4-6"）到特定提供商' +
            '模型 ID（例如 Bedrock 推理配置文件 ARN）的映射。通常由' +
            '企业管理员在托管设置中配置。',
        ),
      // 是否自动批准项目中的所有 MCP 服务器
      enableAllProjectMcpServers: z
        .boolean()
        .optional()
        .describe('是否自动批准项目中的所有 MCP 服务器'),
      // 来自 .mcp.json 的已批准 MCP 服务器列表
      enabledMcpjsonServers: z
        .array(z.string())
        .optional()
        .describe('来自 .mcp.json 的已批准 MCP 服务器列表'),
      // 来自 .mcp.json 的被拒绝 MCP 服务器列表
      disabledMcpjsonServers: z
        .array(z.string())
        .optional()
        .describe('来自 .mcp.json 的被拒绝 MCP 服务器列表'),
      // 企业级 MCP 服务器白名单
      allowedMcpServers: z
        .array(AllowedMcpServerEntrySchema())
        .optional()
        .describe(
          '企业级可使用的 MCP 服务器白名单。' +
            '适用于所有作用域，包括来自 managed-mcp.json 的企业服务器。' +
            '如果未定义，则允许所有服务器。如果是空数组，则不允许任何服务器。' +
            '黑名单优先级更高——如果一个服务器同时出现在两个列表中，它将被拒绝。',
        ),
      // 企业级 MCP 服务器黑名单
      deniedMcpServers: z
        .array(DeniedMcpServerEntrySchema())
        .optional()
        .describe(
          '企业级明确阻止的 MCP 服务器黑名单。' +
            '如果一个服务器在黑名单上，它将在所有作用域（包括企业级）中被阻止。' +
            '黑名单优先级高于白名单——如果一个服务器同时出现在两个列表中，它将被拒绝。',
        ),
      hooks: HooksSchema()
        .optional()
        .describe('在工具执行前后运行的自定义命令'),
      worktree: z
        .object({
          symlinkDirectories: z
            .array(z.string())
            .optional()
            .describe(
              '从主仓库符号链接到工作树的目录，以避免磁盘膨胀。' +
                '必须显式配置——默认情况下不会符号链接任何目录。' +
                '常见示例："node_modules"、".cache"、".bin"',
            ),
          sparsePaths: z
            .array(z.string())
            .optional()
            .describe(
              '通过 git sparse-checkout（锥形模式）创建工作树时要包含的目录。' +
                '在大型单体仓库中速度显著提升——只有列出的路径会写入磁盘。',
            ),
        })
        .optional()
        .describe('用于 --worktree 标志的 Git 工作树配置。'),
      // 是否禁用所有钩子和状态行
      disableAllHooks: z
        .boolean()
        .optional()
        .describe('禁用所有钩子和状态行执行'),
      // input-box `!` 命令使用哪个 shell 作为后端（参见 docs/design/ps-shell-selection.md §4.2）
      defaultShell: z
        .enum(['bash', 'powershell'])
        .optional()
        .describe(
          'input-box ! 命令的默认 shell。' +
            "所有平台默认均为 'bash'（Windows 不会自动切换）。",
        ),
      // 仅运行托管设置（managed-settings.json）中定义的钩子
      allowManagedHooksOnly: z
        .boolean()
        .optional()
        .describe(
          '当设置为 true（且在托管设置中）时，仅运行来自托管设置的钩子。' +
            '用户、项目和本地钩子将被忽略。',
        ),
      // HTTP 钩子允许访问的 URL 模式白名单（遵循 allowedMcpServers 的先例）
      allowedHttpHookUrls: z
        .array(z.string())
        .optional()
        .describe(
          'HTTP 钩子允许访问的 URL 模式白名单。' +
            '支持使用 * 作为通配符（例如 "https://hooks.example.com/*"）。' +
            '设置后，URL 不匹配的 HTTP 钩子将被阻止。' +
            '如果未定义，则允许所有 URL。如果是空数组，则不允许任何 HTTP 钩子。' +
            '数组会在不同设置源之间合并（语义与 allowedMcpServers 相同）。',
        ),
      // HTTP 钩子可插入到请求头中的环境变量名称白名单
      httpHookAllowedEnvVars: z
        .array(z.string())
        .optional()
        .describe(
          'HTTP 钩子可插入到请求头中的环境变量名称白名单。' +
            '设置后，每个钩子的有效允许环境变量将是与此列表的交集。' +
            '如果未定义，则不施加限制。' +
            '数组会在不同设置源之间合并（语义与 allowedMcpServers 相同）。',
        ),
      // 仅使用托管设置（managed-settings.json）中定义的权限规则
      allowManagedPermissionRulesOnly: z
        .boolean()
        .optional()
        .describe(
          '当设置为 true（且在托管设置中）时，仅遵循来自托管设置的权限规则（允许/拒绝/询问）。' +
            '用户、项目、本地以及 CLI 参数中的权限规则将被忽略。',
        ),
      // 仅从托管设置中读取 MCP 白名单策略
      allowManagedMcpServersOnly: z
        .boolean()
        .optional()
        .describe(
          '当设置为 true（且在托管设置中）时，allowedMcpServers 仅从托管设置中读取。' +
            'deniedMcpServers 仍会合并所有来源的规则，因此用户可以为自己拒绝某些服务器。' +
            '用户仍可添加自己的 MCP 服务器，但仅管理员定义的允许列表生效。',
        ),
      // 强制仅通过插件进行自定义（LinkedIn 通过 GTM 提出的要求）
      strictPluginOnlyCustomization: z
        .preprocess(
          // 向前兼容：丢弃未知的界面名称，这样未来的枚举值（例如 'co
          // mmands'）就不会导致 safeParse 失败并将整个托管
          // 设置文件置空（settings.ts:101）。旧客户端上
          // 的 ["skills", "commands"] → ["ski
          // lls"] → 锁定已知项，忽略未知项。降级为较少锁定状态
          // ，绝不会变为全部解锁。
          v =>
            Array.isArray(v)
              ? v.filter(x =>
                  (CUSTOMIZATION_SURFACES as readonly string[]).includes(x),
                )
              : v,
          z.union([z.boolean(), z.array(z.enum(CUSTOMIZATION_SURFACES))]),
        )
        .optional()
        // 非数组的无效值（"skills" 字符串，{object
        // }）会原样通过预处理，并导致联合类型校验失败 → 整个托管
        // 设置文件置空。.catch 将该字段置为 undefine
        // d。降级为该字段解锁状态，绝不会导致整个配置损坏。Doc
        // tor 会标记原始值。
        .catch(undefined)
        .describe(
          '在托管设置中设置时，阻止对所列界面使用非插件的自定义来源。' +
            '数组形式锁定特定界面（例如 ["skills", "hooks"]）；`true` 锁定全部四个；`false` 为显式无操作。' +
            '被阻止的：~/.claude/{surface}/、.claude/{surface}/（项目）、settings.json 钩子、.mcp.json。' +
            '不被阻止的：托管（policySettings）来源、插件提供的自定义。' +
            '与 strictKnownMarketplaces 组合以实现端到端管理员控制 —— 插件由' +
            '市场允许列表控制，其他一切在此处被阻止。',
        ),
      // 状态行，用于自定义状态行显示
      statusLine: z
        .object({
          type: z.literal('command'),
          command: z.string(),
          padding: z.number().optional(),
        })
        .optional()
        .describe('自定义状态行显示配置'),
      // 已启用的插件，使用 marketplace-first 格式
      enabledPlugins: z
        .record(
          z.string(),
          z.union([z.array(z.string()), z.boolean(), z.undefined()]),
        )
        .optional()
        .describe(
          '已启用的插件，使用 plugin-id@marketplace-id 格式。示例：{ "formatter@anthropic-tools": true }。也支持带版本约束的扩展格式。',
        ),
      // 此仓库的额外市场（通常用于项目设置）
      extraKnownMarketplaces: z
        .record(z.string(), ExtraKnownMarketplaceSchema())
        .check(ctx => {
          // 对于设置来源，键必须等于 source.name。diffMarketpla
          // ces 通过字典键查找物化状态；addMarketplaceSource 存储
          // 在 marketplace.name 下（对于设置，等于 source.nam
          // e）。不匹配意味着协调器永远不会收敛 —— 每个会话：键查找失败 → 'mi
          // ssing' → source-idempotency 返回 alre
          // adyMaterialized 但仍 installed++ → 无意义的缓
          // 存清除。对于 github/git/url，名称来自获取的 marketpla
          // ce.json（不匹配是预期且无害的）；对于设置，键和名称都由用户在同一
          // JSON 对象中编写。
          for (const [key, entry] of Object.entries(ctx.value)) {
            if (
              entry.source.source === 'settings' &&
              entry.source.name !== key
            ) {
              ctx.issues.push({
                code: 'custom',
                input: entry.source.name,
                path: [key, 'source', 'name'],
                message:
                  `设置来源的市场名称必须与其 extraKnownMarketplaces 键匹配` +
                  `（获取到键 "${key}" 但 source.name 为 "${entry.source.name}"）`,
              })
            }
          }
        })
        .optional()
        .describe(
          '为此仓库提供的额外市场。通常在仓库的 .claude/settings.json 中使用，以确保团队成员拥有所需的插件来源。',
        ),
      // 企业级严格允许的市场来源列表（仅策略设置）设置
      // 后，仅能添加这些确切的来源。检查发生在下载之前。
      strictKnownMarketplaces: z
        .array(MarketplaceSourceSchema())
        .optional()
        .describe(
          '企业级严格允许的市场来源列表。在托管设置中设置时，' +
            '仅能将这些确切的来源添加为市场。检查发生在' +
            '下载之前，因此被阻止的来源永远不会触及文件系统。' +
            '注意：这仅是一个策略门控 —— 它不会注册市场。' +
            '要为用户预注册允许的市场，还需设置 extraKnownMarketplaces。',
        ),
      // 企业级市场来源阻止列表（仅策略设置）设置后
      // ，这些确切的来源将被阻止。检查发生在下载之前。
      blockedMarketplaces: z
        .array(MarketplaceSourceSchema())
        .optional()
        .describe(
          '企业级市场来源阻止列表。在托管设置中设置时，' +
            '这些确切的来源将被阻止添加为市场。检查发生在' +
            '下载之前，因此被阻止的来源永远不会触及文件系统。',
        ),
      // 强制使用特定的登录方法：'claudeai' 对应 Claude Pro/Max，'console' 对应 Console 计费
      forceLoginMethod: z
        .enum(['claudeai', 'console'])
        .optional()
        .describe(
          '强制使用特定登录方式："claudeai" 对应 Claude Pro/Max，"console" 对应控制台计费',
        ),
      // 用于 OAuth 登录的组织 UUID（将作为 URL 参数添加到授权 URL）
      forceLoginOrgUUID: z
        .string()
        .optional()
        .describe('用于 OAuth 登录的组织 UUID'),
      otelHeadersHelper: z
        .string()
        .optional()
        .describe('输出 OpenTelemetry 头信息的脚本路径'),
      outputStyle: z.string().optional().describe('控制助手响应的输出样式'),
      language: z
        .string()
        .optional()
        .describe(
          'Claude 响应和语音听写的首选语言（例如 "japanese"、"spanish"）',
        ),
      skipWebFetchPreflight: z
        .boolean()
        .optional()
        .describe('为具有严格安全策略的企业环境跳过 WebFetch 阻止列表检查'),
      sandbox: SandboxSettingsSchema().optional(),
      feedbackSurveyRate: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe(
          '符合条件时显示会话质量调查的概率（0–1）。0.05 是一个合理的起始值。',
        ),
      spinnerTipsEnabled: z
        .boolean()
        .optional()
        .describe('是否在加载指示器中显示提示'),
      spinnerVerbs: z
        .object({
          mode: z.enum(['append', 'replace']),
          verbs: z.array(z.string()),
        })
        .optional()
        .describe(
          '自定义加载指示器动词。mode: "append" 将动词添加到默认列表，"replace" 仅使用您提供的动词。',
        ),
      spinnerTipsOverride: z
        .object({
          excludeDefault: z.boolean().optional(),
          tips: z.array(z.string()),
        })
        .optional()
        .describe(
          '覆盖加载指示器提示。tips: 提示字符串数组。excludeDefault: 如果为 true，则仅显示自定义提示（默认: false）。',
        ),
      syntaxHighlightingDisabled: z
        .boolean()
        .optional()
        .describe('是否在差异比较中禁用语法高亮'),
      terminalTitleFromRename: z
        .boolean()
        .optional()
        .describe(
          '/rename 命令是否更新终端标签页标题（默认为 true）。设置为 false 以保留自动生成的主题标题。',
        ),
      alwaysThinkingEnabled: z
        .boolean()
        .optional()
        .describe(
          '当为 false 时，思考功能被禁用。当不存在或为 true 时，思考功能' +
            '对支持的模型自动启用。',
        ),
      effortLevel: z
        .enum(
          process.env.USER_TYPE === 'ant'
            ? ['low', 'medium', 'high', 'xhigh', 'max']
            : ['low', 'medium', 'high', 'xhigh'],
        )
        .optional()
        .catch(undefined)
        .describe('支持模型的持久化努力级别。'),
      advisorModel: z
        .string()
        .optional()
        .describe('服务器端顾问工具使用的顾问模型。'),
      fastMode: z
        .boolean()
        .optional()
        .describe(
          '当为 true 时，启用快速模式。当不存在或为 false 时，快速模式关闭。',
        ),
      fastModePerSessionOptIn: z
        .boolean()
        .optional()
        .describe(
          '当为 true 时，快速模式不会跨会话持久化。每个会话开始时快速模式均为关闭状态。',
        ),
      promptSuggestionEnabled: z
        .boolean()
        .optional()
        .describe(
          '当为 false 时，提示建议被禁用。当不存在或为 true 时，' +
            '提示建议被启用。',
        ),
      poorMode: z
        .boolean()
        .optional()
        .describe(
          '当为 true 时，省流模式激活——禁用 extract_memories 和 prompt_suggestion 以节省 token。',
        ),
      showClearContextOnPlanAccept: z
        .boolean()
        .optional()
        .describe(
          '当为 true 时，计划批准对话框提供“清除上下文”选项。默认为 false。',
        ),
      agent: z
        .string()
        .optional()
        .describe(
          '用于主线程的代理名称（内置或自定义）。' +
            '应用该代理的系统提示、工具限制和模型。',
        ),
      companyAnnouncements: z
        .array(z.string())
        .optional()
        .describe('启动时显示的公司公告（如果提供多个，将随机选择一个）'),
      pluginConfigs: z
        .record(
          z.string(),
          z.object({
            mcpServers: z
              .record(
                z.string(),
                z.record(
                  z.string(),
                  z.union([
                    z.string(),
                    z.number(),
                    z.boolean(),
                    z.array(z.string()),
                  ]),
                ),
              )
              .optional()
              .describe('按服务器名称索引的 MCP 服务器用户配置值'),
            options: z
              .record(
                z.string(),
                z.union([
                  z.string(),
                  z.number(),
                  z.boolean(),
                  z.array(z.string()),
                ]),
              )
              .optional()
              .describe(
                '来自插件清单 userConfig 的非敏感选项值，按选项名称索引。敏感值应存入安全存储。',
              ),
          }),
        )
        .optional()
        .describe(
          '按插件 ID（plugin@marketplace 格式）索引的每个插件的配置，包括 MCP 服务器用户配置',
        ),
      remote: z
        .object({
          defaultEnvironmentId: z
            .string()
            .optional()
            .describe('用于远程会话的默认环境 ID'),
        })
        .optional()
        .describe('远程会话配置'),
      autoUpdatesChannel: z
        .enum(['latest', 'stable'])
        .optional()
        .describe('自动更新的发布通道（latest 或 stable）'),
      ...(feature('LODESTONE')
        ? {
            disableDeepLinkRegistration: z
              .enum(['disable'])
              .optional()
              .describe('阻止向操作系统注册 claude-cli:// 协议处理器'),
          }
        : {}),
      minimumVersion: z
        .string()
        .optional()
        .describe('最低版本限制 - 防止切换到 stable 通道时降级'),
      plansDirectory: z
        .string()
        .optional()
        .describe(
          '计划文件的自定义目录，相对于项目根目录。' +
            '如果未设置，则默认为 ~/.claude/plans/',
        ),
      ...(process.env.USER_TYPE === 'ant'
        ? {
            classifierPermissionsEnabled: z
              .boolean()
              .optional()
              .describe('为 Bash(prompt:...) 权限规则启用基于 AI 的分类'),
          }
        : {}),
      ...(feature('PROACTIVE') || feature('KAIROS')
        ? {
            minSleepDurationMs: z
              .number()
              .nonnegative()
              .int()
              .optional()
              .describe(
                'Sleep 工具必须休眠的最短时长（毫秒）。' +
                  '可用于限制主动 tick 的频率。',
              ),
            maxSleepDurationMs: z
              .number()
              .int()
              .min(-1)
              .optional()
              .describe(
                'Sleep 工具可以休眠的最长时长（毫秒）。' +
                  '设置为 -1 表示无限期休眠（等待用户输入）。' +
                  '在远程/托管环境中限制空闲时间时很有用。',
              ),
          }
        : {}),
      ...(feature('VOICE_MODE')
        ? {
            voiceEnabled: z
              .boolean()
              .optional()
              .describe('启用语音模式（按住说话听写）'),
            voiceProvider: z
              .enum(['anthropic', 'doubao'])
              .optional()
              .describe(
                'Voice STT backend: "anthropic" (default) or "doubao" (Doubao ASR)',
              ),
          }
        : {}),
      ...(feature('KAIROS')
        ? {
            assistant: z
              .boolean()
              .optional()
              .describe(
                '以助手模式启动 Claude（自定义系统提示、简洁视图、定时签到技能）',
              ),
            assistantName: z
              .string()
              .optional()
              .describe('助手的显示名称，显示在 claude.ai 会话列表中'),
          }
        : {}),
      // Teams/Enterprise 选择加入频道通知。默认关闭。声
      // 明了 claude/channel 能力的 MCP 服务器可以将
      // 入站消息推送到对话中；对于托管组织，这仅在明确启用时才有效。哪些服务
      // 器可以连接仍然由 allowedMcpServers/deniedM
      // cpServers 控制。非功能传播：KAIROS_CHA
      // NNELS 是 external:true，并且传播会破坏 all
      // owedChannelPlugins 的类型推断（.passthro
      // ugh() 通配符会给出 {} 而不是数组类型）。
      channelsEnabled: z
        .boolean()
        .optional()
        .describe(
          'Teams/Enterprise 选择加入频道通知（具有 ' +
            'claude/channel 能力的 MCP 服务器推送入站消息）。默认关闭。' +
            '设置为 true 以允许；用户随后通过 --channels 选择服务器。',
        ),
      // 组织级别的频道插件允许列表。设置后，将替换 A
      // nthropic 的分类账——管理员负责信任决策。
      // 未定义意味着回退到分类账。仅插件条目形状（与分类
      // 账相同）；服务器类型条目仍需要开发标志。
      allowedChannelPlugins: z
        .array(
          z.object({
            marketplace: z.string(),
            plugin: z.string(),
          }),
        )
        .optional()
        .describe(
          'Teams/Enterprise 的频道插件允许列表。设置后，' +
            '替换默认的 Anthropic 允许列表——管理员决定哪些' +
            '插件可以推送入站消息。未定义则回退到默认列表。' +
            '需要 channelsEnabled: true。',
        ),
      ...(feature('KAIROS') || feature('KAIROS_BRIEF')
        ? {
            defaultView: z
              .enum(['chat', 'transcript'])
              .optional()
              .describe(
                '默认对话记录视图：chat（仅 SendUserMessage 检查点）或 transcript（完整）',
              ),
          }
        : {}),
      prefersReducedMotion: z
        .boolean()
        .optional()
        .describe('为无障碍访问减少或禁用动画（旋转微光、闪烁效果等）'),
      autoMemoryEnabled: z
        .boolean()
        .optional()
        .describe(
          '为此项目启用自动记忆。当为 false 时，Claude 将不会读取或写入自动记忆目录。',
        ),
      autoMemoryDirectory: z
        .string()
        .optional()
        .describe(
          '自动记忆存储的自定义目录路径。支持 ~/ 前缀以展开主目录。出于安全考虑，如果在 projectSettings（已签入的 .claude/settings.json）中设置，则忽略此值。未设置时，默认为 ~/.claude/projects/<sanitized-cwd>/memory/。',
        ),
      autoDreamEnabled: z
        .boolean()
        .optional()
        .describe(
          '启用后台记忆整合（自动梦境）。设置后，将覆盖服务器端默认值。',
        ),
      showThinkingSummaries: z
        .boolean()
        .optional()
        .describe('在对话记录视图中显示思考摘要（ctrl+o）。默认：false。'),
      skipDangerousModePermissionPrompt: z
        .boolean()
        .optional()
        .describe('用户是否已接受绕过权限模式对话框'),
      ...(feature('TRANSCRIPT_CLASSIFIER')
        ? {
            skipAutoPermissionPrompt: z
              .boolean()
              .optional()
              .describe('用户是否已接受自动模式选择加入对话框'),
            useAutoModeDuringPlan: z
              .boolean()
              .optional()
              .describe(
                '当自动模式可用时，计划模式是否使用自动模式语义（默认值：true）',
              ),
            autoMode: z
              .object({
                allow: z
                  .array(z.string())
                  .optional()
                  .describe('自动模式分类器允许部分的规则'),
                soft_deny: z
                  .array(z.string())
                  .optional()
                  .describe('自动模式分类器拒绝部分的规则'),
                ...(process.env.USER_TYPE === 'ant'
                  ? {
                      // 为 ant 用户提供的向后兼容别名；外部用户使用 soft_deny
                      deny: z.array(z.string()).optional(),
                    }
                  : {}),
                environment: z
                  .array(z.string())
                  .optional()
                  .describe('自动模式分类器环境部分的条目'),
              })
              .optional()
              .describe('自动模式分类器提示自定义'),
          }
        : {}),
      disableAutoMode: z.enum(['disable']).optional().describe('禁用自动模式'),
      sshConfigs: z
        .array(
          z.object({
            id: z
              .string()
              .describe('此 SSH 配置的唯一标识符。用于跨设置源匹配配置。'),
            name: z.string().describe('SSH 连接的显示名称'),
            sshHost: z
              .string()
              .describe(
                'SSH 主机，格式为 "user@hostname" 或 "hostname"，或来自 ~/.ssh/config 的主机别名',
              ),
            sshPort: z
              .number()
              .int()
              .optional()
              .describe('SSH 端口（默认值：22）'),
            sshIdentityFile: z
              .string()
              .optional()
              .describe('SSH 身份文件（私钥）的路径'),
            startDirectory: z
              .string()
              .optional()
              .describe(
                '远程主机上的默认工作目录。' +
                  '支持波浪号扩展（例如 ~/projects）。' +
                  '如果未指定，则默认为远程用户主目录。' +
                  '可通过 `claude ssh <config> [dir]` 中的 [dir] 位置参数覆盖。',
              ),
          }),
        )
        .optional()
        .describe(
          '用于远程环境的 SSH 连接配置。' +
            '通常由企业管理员在托管设置中设置' +
            '以便为团队成员预配置 SSH 连接。',
        ),
      claudeMdExcludes: z
        .array(z.string())
        .optional()
        .describe(
          '要从加载中排除的 CLAUDE.md 文件的 Glob 模式或绝对路径。' +
            '使用 picomatch 将模式与绝对文件路径进行匹配。' +
            '仅适用于用户、项目和本地内存类型（托管/策略文件无法排除）。' +
            '示例："/home/user/monorepo/CLAUDE.md"、"**/code/CLAUDE.md"、"**/some-dir/.claude/rules/**"',
        ),
      pluginTrustMessage: z
        .string()
        .optional()
        .describe(
          '在安装前显示的插件信任警告后附加的自定义消息。' +
            '仅从策略设置（managed-settings.json / MDM）中读取。' +
            '对企业管理员添加组织特定上下文很有用' +
            '（例如，“我们内部市场中的所有插件都经过审查和批准。”）。',
        ),
    })
    .passthrough(),
)

/** 插件钩子的内部类型 - 包含用于执行的插件上下文。
不是 Zod 模式，因为它不面向用户（插件提供原生钩子）。 */
export type PluginHookMatcher = {
  matcher?: string
  hooks: HookCommand[]
  pluginRoot: string
  pluginName: string
  pluginId: string // 格式："插件名称@市场名称"
}

/** 技能钩子的内部类型 - 包含用于执行的技能上下文。
由于不面向用户（技能提供原生钩子），因此不是 Zod 模式。 */
export type SkillHookMatcher = {
  matcher?: string
  hooks: HookCommand[]
  skillRoot: string
  skillName: string
}

export type AllowedMcpServerEntry = z.infer<
  ReturnType<typeof AllowedMcpServerEntrySchema>
>
export type DeniedMcpServerEntry = z.infer<
  ReturnType<typeof DeniedMcpServerEntrySchema>
>
export type SettingsJson = z.infer<ReturnType<typeof SettingsSchema>>

/** 用于带有 serverName 的 MCP 服务器条目的类型守卫 */
export function isMcpServerNameEntry(
  entry: AllowedMcpServerEntry | DeniedMcpServerEntry,
): entry is { serverName: string } {
  return 'serverName' in entry && entry.serverName !== undefined
}

/** 用于带有 serverCommand 的 MCP 服务器条目的类型守卫 */
export function isMcpServerCommandEntry(
  entry: AllowedMcpServerEntry | DeniedMcpServerEntry,
): entry is { serverCommand: string[] } {
  return 'serverCommand' in entry && entry.serverCommand !== undefined
}

/** 用于带有 serverUrl 的 MCP 服务器条目的类型守卫 */
export function isMcpServerUrlEntry(
  entry: AllowedMcpServerEntry | DeniedMcpServerEntry,
): entry is { serverUrl: string } {
  return 'serverUrl' in entry && entry.serverUrl !== undefined
}

/** MCPB MCP 服务器的用户配置值 */
export type UserConfigValues = Record<
  string,
  string | number | boolean | string[]
>

/** 存储在 settings.json 中的插件配置 */
export type PluginConfig = {
  mcpServers?: {
    [serverName: string]: UserConfigValues
  }
}
