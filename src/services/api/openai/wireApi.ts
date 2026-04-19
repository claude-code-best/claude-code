export type OpenAIWireAPI = 'chat_completions' | 'responses'

const OPENAI_WIRE_API_VALUES = new Set<OpenAIWireAPI>([
  'chat_completions',
  'responses',
])

export function getOpenAIWireAPI(
  baseURL = process.env.OPENAI_BASE_URL,
  explicitWireAPI = process.env.OPENAI_WIRE_API,
): OpenAIWireAPI {
  const explicit = explicitWireAPI?.trim().toLowerCase()
  if (explicit && OPENAI_WIRE_API_VALUES.has(explicit as OpenAIWireAPI)) {
    return explicit as OpenAIWireAPI
  }

  if (!baseURL) {
    return 'chat_completions'
  }

  try {
    const pathname = new URL(baseURL).pathname.replace(/\/+$/, '')
    if (pathname.endsWith('/codex')) {
      return 'responses'
    }
  } catch {
    if (baseURL.replace(/\/+$/, '').endsWith('/codex')) {
      return 'responses'
    }
  }

  return 'chat_completions'
}
