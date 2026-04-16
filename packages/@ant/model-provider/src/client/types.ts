/**
 * Client factory interfaces.
 * Authentication is handled externally — main project provides factory implementations.
 */
export interface ClientFactories {
  /** Get Anthropic client (1st party, Bedrock, Foundry, Vertex) */
  getAnthropicClient: (params: {
    model?: string
    maxRetries: number
    fetchOverride?: unknown
    source?: string
  }) => Promise<unknown>

  /** Get OpenAI-compatible client */
  getOpenAIClient: (params: {
    maxRetries: number
    fetchOverride?: unknown
    source?: string
  }) => unknown

  /** Stream Gemini generate content */
  streamGeminiGenerateContent: (params: {
    model: string
    signal?: AbortSignal
    fetchOverride?: unknown
    body: Record<string, unknown>
  }) => AsyncIterable<unknown>

  /** Get Grok client (OpenAI-compatible) */
  getGrokClient: (params: {
    maxRetries: number
    fetchOverride?: unknown
    source?: string
  }) => unknown
}
