import { CLAUDE_OPUS_4_6_CONFIG } from '../model/configs.js'
import { getAPIProvider } from '../model/providers.js'

// @[MODEL LAUNCH]: Update the fallback model below.
// When the user has never set teammateDefaultModel in /config, new teammates
// use Opus 4.6. Must be provider-aware so Bedrock/Vertex/Foundry customers get
// the correct model ID. For local provider, it uses process.env.LOCAL_MODEL.
export function getHardcodedTeammateModelFallback(): string {
  const provider = getAPIProvider()
  if (provider === 'local') return process.env.LOCAL_MODEL || 'claude-opus-4-6'
  return CLAUDE_OPUS_4_6_CONFIG[provider]
}
