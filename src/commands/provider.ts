import type { Command } from '../commands.js'
import type { LocalCommandCall } from '../types/command.js'
import { getAPIProvider } from '../utils/model/providers.js'
import { updateSettingsForSource } from '../utils/settings/settings.js'
import { getSettings_DEPRECATED } from '../utils/settings/settings.js'
import { applyConfigEnvironmentVariables } from '../utils/managedEnv.js'

function getEnvVarForProvider(provider: string): string {
  switch (provider) {
    case 'bedrock':
      return 'CLAUDE_CODE_USE_BEDROCK'
    case 'vertex':
      return 'CLAUDE_CODE_USE_VERTEX'
    case 'foundry':
      return 'CLAUDE_CODE_USE_FOUNDRY'
    case 'gemini':
      return 'CLAUDE_CODE_USE_GEMINI'
    case 'grok':
      return 'CLAUDE_CODE_USE_GROK'
    default:
      throw new Error(`未知的提供商：${provider}`)
  }
}

// 获取合并后的环境变量：process.env + settings.env（来自 userSettings）
function getMergedEnv(): Record<string, string> {
  const settings = getSettings_DEPRECATED()
  const merged: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter(
      (e): e is [string, string] => e[1] !== undefined,
    ),
  )
  if (settings?.env) {
    Object.assign(merged, settings.env)
  }
  return merged
}

const call: LocalCommandCall = async (args, context) => {
  const arg = args.trim().toLowerCase()

  // 无参数：显示当前提供商
  if (!arg) {
    const current = getAPIProvider()
    return { type: 'text', value: `当前 API 提供商：${current}` }
  }

  // unset - 清除设置，回退到环境变量
  if (arg === 'unset') {
    updateSettingsForSource('userSettings', { modelType: undefined })
    // 同时清除所有提供商特定的环境变量以防止冲突
    delete process.env.CLAUDE_CODE_USE_BEDROCK
    delete process.env.CLAUDE_CODE_USE_VERTEX
    delete process.env.CLAUDE_CODE_USE_FOUNDRY
    delete process.env.CLAUDE_CODE_USE_OPENAI
    delete process.env.CLAUDE_CODE_USE_GEMINI
    delete process.env.CLAUDE_CODE_USE_GROK
    return {
      type: 'text',
      value: 'API 提供商已清除（将使用环境变量）。',
    }
  }

  // 验证提供商
  const validProviders = [
    'anthropic',
    'openai',
    'gemini',
    'grok',
    'bedrock',
    'vertex',
    'foundry',
  ]
  if (!validProviders.includes(arg)) {
    return {
      type: 'text',
      value: `无效的提供商：${arg}
有效的：${validProviders.join(', ')}`,
    }
  }

  // 切换到 openai 时检查环境变量（包括 settings.env）
  if (arg === 'openai') {
    const mergedEnv = getMergedEnv()
    const hasKey = !!mergedEnv.OPENAI_API_KEY
    const hasUrl = !!mergedEnv.OPENAI_BASE_URL
    if (!hasKey || !hasUrl) {
      updateSettingsForSource('userSettings', { modelType: 'openai' })
      const missing = []
      if (!hasKey) missing.push('OPENAI_API_KEY')
      if (!hasUrl) missing.push('OPENAI_BASE_URL')
      return {
        type: 'text',
        value: `已切换到 OpenAI 提供商。
警告：缺少环境变量：${missing.join(', ')}
请通过 /login 配置或手动设置。`,
      }
    }
  }

  // 切换到 grok 时检查环境变量（包括 settings.env）
  if (arg === 'grok') {
    const mergedEnv = getMergedEnv()
    const hasKey = !!(mergedEnv.GROK_API_KEY || mergedEnv.XAI_API_KEY)
    if (!hasKey) {
      updateSettingsForSource('userSettings', { modelType: 'grok' })
      return {
        type: 'text',
        value: `已切换到 Grok 提供商。
警告：缺少环境变量：GROK_API_KEY（或 XAI_API_KEY）
请通过 settings.json 中的 env 或手动设置来配置。`,
      }
    }
  }

  // 切换到 gemini 时检查环境变量（包括 settings.env）
  if (arg === 'gemini') {
    const mergedEnv = getMergedEnv()
    const hasKey = !!mergedEnv.GEMINI_API_KEY
    // GEMINI_BASE_URL 是可选的（有默认值）
    if (!hasKey) {
      updateSettingsForSource('userSettings', { modelType: 'gemini' })
      return {
        type: 'text',
        value: `已切换到 Gemini 提供商。
警告：缺少环境变量：GEMINI_API_KEY
请通过 /login 配置或手动设置。`,
      }
    }
  }

  // Handle different provider types
  // - 'anthropic', 'openai', 'gemini' are stored in settings.json (persistent)
  // - 'bedrock', 'vertex', 'foundry' are env-only (do NOT touch settings.json)
  if (
    arg === 'anthropic' ||
    arg === 'openai' ||
    arg === 'gemini' ||
    arg === 'grok'
  ) {
    // Clear any cloud provider env vars to avoid conflicts
    delete process.env.CLAUDE_CODE_USE_BEDROCK
    delete process.env.CLAUDE_CODE_USE_VERTEX
    delete process.env.CLAUDE_CODE_USE_FOUNDRY
    delete process.env.CLAUDE_CODE_USE_OPENAI
    delete process.env.CLAUDE_CODE_USE_GEMINI
    delete process.env.CLAUDE_CODE_USE_GROK
    // 更新 settings.json
    updateSettingsForSource('userSettings', { modelType: arg })
    // 确保 settings.env 应用到 process.env
    applyConfigEnvironmentVariables()
    return { type: 'text', value: `API 提供商已设置为 ${arg}。` }
  } else {
    // 云提供商：仅设置环境变量，请勿修改 settings.json
    delete process.env.CLAUDE_CODE_USE_OPENAI
    delete process.env.OPENAI_API_KEY
    delete process.env.OPENAI_BASE_URL
    delete process.env.CLAUDE_CODE_USE_GEMINI
    delete process.env.CLAUDE_CODE_USE_GROK
    process.env[getEnvVarForProvider(arg)] = '1'
    // 请勿修改 settings.json - 云提供商仅由环境变量控制
    applyConfigEnvironmentVariables()
    return {
      type: 'text',
      value: `API 提供商已设置为 ${arg}（通过环境变量）。`,
    }
  }
}

const provider = {
  type: 'local',
  name: 'provider',
  description:
    '切换 API 提供商（anthropic/openai/gemini/grok/bedrock/vertex/foundry）',
  aliases: ['api'],
  argumentHint: '[anthropic|openai|gemini|grok|bedrock|vertex|foundry|unset]',
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default provider
