/**
 * OrcaRouter preset for the `/login` flow.
 *
 * OrcaRouter is an OpenAI-compatible model routing gateway: one base URL and
 * one API key give access to models from OpenAI, Anthropic, Google, DeepSeek,
 * Qwen, MiniMax, xAI and others. Because it speaks the OpenAI Chat Completions
 * protocol, it reuses the existing `CLAUDE_CODE_USE_OPENAI` compatibility layer
 * in `src/services/api/openai/` - the preset only supplies the endpoint and the
 * default model ids so the login form is prefilled instead of blank.
 */

/** Base URL of the OrcaRouter OpenAI-compatible endpoint. */
export const ORCAROUTER_BASE_URL = 'https://api.orcarouter.ai/v1'

/** Where users create an API key. */
export const ORCAROUTER_API_KEY_PAGE = 'https://www.orcarouter.ai/console'

/** Full model catalog. */
export const ORCAROUTER_MODELS_PAGE = 'https://www.orcarouter.ai/models'

/** OrcaRouter API keys start with this prefix. */
export const ORCAROUTER_KEY_PREFIX = 'sk-orca-'

/**
 * Default model ids for the three capability tiers the CLI maps onto.
 *
 * `orcarouter/auto` is deliberately not used as a default: its candidate pool
 * can route to models without reliable tool-calling support, which breaks the
 * agent loop. Users who want adaptive routing can type it in manually.
 */
export const ORCAROUTER_DEFAULT_MODELS = {
  haiku: 'anthropic/claude-haiku-4.5',
  sonnet: 'anthropic/claude-sonnet-5',
  opus: 'anthropic/claude-opus-5',
} as const

/** Initial form values for the OrcaRouter branch of the `/login` flow. */
export function getOrcaRouterLoginDefaults(
  env: Record<string, string | undefined> = process.env,
): {
  baseUrl: string
  apiKey: string
  haikuModel: string
  sonnetModel: string
  opusModel: string
} {
  return {
    baseUrl: env.ORCAROUTER_BASE_URL ?? ORCAROUTER_BASE_URL,
    apiKey: env.ORCAROUTER_API_KEY ?? '',
    haikuModel:
      env.ORCAROUTER_DEFAULT_HAIKU_MODEL ?? ORCAROUTER_DEFAULT_MODELS.haiku,
    sonnetModel:
      env.ORCAROUTER_DEFAULT_SONNET_MODEL ?? ORCAROUTER_DEFAULT_MODELS.sonnet,
    opusModel:
      env.ORCAROUTER_DEFAULT_OPUS_MODEL ?? ORCAROUTER_DEFAULT_MODELS.opus,
  }
}
