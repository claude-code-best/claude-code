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
      throw new Error(`Unknown provider: ${provider}`)
  }
}

// Get merged env: process.env + settings.env (from userSettings)
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

const call: LocalCommandCall = async (args, _context) => {
  const arg = args.trim().toLowerCase()

  // No argument: show current provider
  if (!arg) {
    const current = getAPIProvider()
    return { type: 'text', value: `Current API provider: ${current}` }
  }

  // unset - clear settings, fallback to env vars
  if (arg === 'unset') {
    updateSettingsForSource('userSettings', { modelType: undefined })
    // Also clear all provider-specific env vars to prevent conflicts
    delete process.env.CLAUDE_CODE_USE_BEDROCK
    delete process.env.CLAUDE_CODE_USE_VERTEX
    delete process.env.CLAUDE_CODE_USE_FOUNDRY
    delete process.env.CLAUDE_CODE_USE_OPENAI
    delete process.env.CLAUDE_CODE_USE_GEMINI
    delete process.env.CLAUDE_CODE_USE_GROK
    return {
      type: 'text',
      value: 'API provider cleared (will use environment variables).',
    }
  }

  // Validate provider
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
      value: `Invalid provider: ${arg}\nValid: ${validProviders.join(', ')}`,
    }
  }

  // Check env vars when switching to openai (including settings.env)
  if (arg === 'openai') {
    const mergedEnv = getMergedEnv()
    const hasChatGPTAuth = mergedEnv.OPENAI_AUTH_MODE === 'chatgpt'
    const hasKey = !!mergedEnv.OPENAI_API_KEY
    const hasUrl = !!mergedEnv.OPENAI_BASE_URL
    if (!hasChatGPTAuth && (!hasKey || !hasUrl)) {
      updateSettingsForSource('userSettings', { modelType: 'openai' })
      const missing = []
      if (!hasKey) missing.push('OPENAI_API_KEY')
      if (!hasUrl) missing.push('OPENAI_BASE_URL')
      return {
        type: 'text',
        value: `Switched to OpenAI provider.\nWarning: Missing env vars: ${missing.join(', ')}\nConfigure them via /login or set manually.`,
      }
    }
  }

  // Check env vars when switching to grok (including settings.env)
  if (arg === 'grok') {
    const mergedEnv = getMergedEnv()
    const hasKey = !!(mergedEnv.GROK_API_KEY || mergedEnv.XAI_API_KEY)
    if (!hasKey) {
      updateSettingsForSource('userSettings', { modelType: 'grok' })
      return {
        type: 'text',
        value: `Switched to Grok provider.\nWarning: Missing env var: GROK_API_KEY (or XAI_API_KEY)\nConfigure it via settings.json env or set manually.`,
      }
    }
  }

  // Check env vars when switching to gemini (including settings.env)
  if (arg === 'gemini') {
    const mergedEnv = getMergedEnv()
    const hasKey = !!mergedEnv.GEMINI_API_KEY
    // GEMINI_BASE_URL is optional (has default)
    if (!hasKey) {
      updateSettingsForSource('userSettings', { modelType: 'gemini' })
      return {
        type: 'text',
        value: `Switched to Gemini provider.\nWarning: Missing env var: GEMINI_API_KEY\nConfigure it via /login or set manually.`,
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
    // Update settings.json
    updateSettingsForSource('userSettings', { modelType: arg })
    // Ensure settings.env gets applied to process.env
    applyConfigEnvironmentVariables()
    return { type: 'text', value: `API provider set to ${arg}.` }
  } else {
    // Cloud providers: set env vars only, do NOT touch settings.json
    delete process.env.CLAUDE_CODE_USE_OPENAI
    delete process.env.OPENAI_API_KEY
    delete process.env.OPENAI_BASE_URL
    delete process.env.CLAUDE_CODE_USE_GEMINI
    delete process.env.CLAUDE_CODE_USE_GROK
    process.env[getEnvVarForProvider(arg)] = '1'
    // Do not modify settings.json - cloud providers controlled solely by env vars
    applyConfigEnvironmentVariables()
    return {
      type: 'text',
      value: `API provider set to ${arg} (via environment variable).`,
    }
  }
}

const provider = {
  type: 'local',
  name: 'provider',
  description:
    'Switch API provider (anthropic/openai/gemini/grok/bedrock/vertex/foundry)',
  aliases: ['api'],
  argumentHint: '[anthropic|openai|gemini|grok|bedrock|vertex|foundry|unset]',
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default provider
