import memoize from 'lodash-es/memoize.js'
import { getAPIProvider } from './providers.js'

export type ModelCapabilityOverride =
  | 'effort'
  | 'max_effort'
  | 'xhigh_effort'
  | 'thinking'
  | 'adaptive_thinking'
  | 'interleaved_thinking'

const ANTHROPIC_TIERS = [
  {
    modelEnvVar: 'ANTHROPIC_DEFAULT_OPUS_MODEL',
    capabilitiesEnvVar: 'ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES',
  },
  {
    modelEnvVar: 'ANTHROPIC_DEFAULT_SONNET_MODEL',
    capabilitiesEnvVar: 'ANTHROPIC_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES',
  },
  {
    modelEnvVar: 'ANTHROPIC_DEFAULT_HAIKU_MODEL',
    capabilitiesEnvVar: 'ANTHROPIC_DEFAULT_HAIKU_MODEL_SUPPORTED_CAPABILITIES',
  },
] as const

const OPENAI_TIERS = [
  {
    modelEnvVar: 'OPENAI_DEFAULT_OPUS_MODEL',
    capabilitiesEnvVar: 'OPENAI_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES',
  },
  {
    modelEnvVar: 'OPENAI_DEFAULT_SONNET_MODEL',
    capabilitiesEnvVar: 'OPENAI_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES',
  },
  {
    modelEnvVar: 'OPENAI_DEFAULT_HAIKU_MODEL',
    capabilitiesEnvVar: 'OPENAI_DEFAULT_HAIKU_MODEL_SUPPORTED_CAPABILITIES',
  },
] as const

/**
* 检查是否为匹配以下任一模型的模型设置了第三方模型功能覆盖：
* 已固定的 ANTHROPIC_DEFAULT_*_MODEL 或 OPENAI_DEFAULT_*_MODEL 环境变量。
*/
export const get3PModelCapabilityOverride = memoize(
  (model: string, capability: ModelCapabilityOverride): boolean | undefined => {
    if (getAPIProvider() === 'firstParty') {
      return undefined
    }
    const m = model.toLowerCase()
    // 根据提供商选择合适的层级列表
    const tiers = getAPIProvider() === 'openai' ? OPENAI_TIERS : ANTHROPIC_TIERS
    for (const tier of tiers) {
      const pinned = process.env[tier.modelEnvVar]
      const capabilities = process.env[tier.capabilitiesEnvVar]
      if (!pinned || capabilities === undefined) continue
      if (m !== pinned.toLowerCase()) continue
      return capabilities
        .toLowerCase()
        .split(',')
        .map(s => s.trim())
        .includes(capability)
    }
    return undefined
  },
  (model, capability) => `${model.toLowerCase()}:${capability}`,
)
