// @ant/model-provider
// Model provider abstraction layer for Claude Code
//
// This package owns the model calling logic and provides:
// - Core query functions (queryModelWithStreaming, etc.)
// - Provider implementations (Anthropic, OpenAI, Gemini, Grok)
// - Type definitions (Message, Tool, Usage, etc.)
// - Dependency injection hooks (analytics, cost tracking, etc.)
//
// Initialization:
//   registerClientFactories({ ... })  // inject auth clients
//   registerHooks({ ... })            // inject analytics/cost/logging

// Hooks (dependency injection)
export { registerHooks, getHooks } from './hooks/index.js'
export type { ModelProviderHooks } from './hooks/types.js'

// Client factories
export { registerClientFactories, getClientFactories } from './client/index.js'
export type { ClientFactories } from './client/types.js'

// Types
export * from './types/index.js'

// Provider model mappings
export { resolveOpenAIModel } from './providers/openai/modelMapping.js'
export { resolveGrokModel } from './providers/grok/modelMapping.js'
export { resolveGeminiModel } from './providers/gemini/modelMapping.js'

// Gemini provider utilities
export { anthropicMessagesToGemini } from './providers/gemini/convertMessages.js'
export { anthropicToolsToGemini, anthropicToolChoiceToGemini } from './providers/gemini/convertTools.js'
export { adaptGeminiStreamToAnthropic } from './providers/gemini/streamAdapter.js'
export {
  GEMINI_THOUGHT_SIGNATURE_FIELD,
  type GeminiContent,
  type GeminiGenerateContentRequest,
  type GeminiPart,
  type GeminiStreamChunk,
  type GeminiTool,
  type GeminiFunctionCallingConfig,
  type GeminiFunctionDeclaration,
  type GeminiFunctionCall,
  type GeminiFunctionResponse,
  type GeminiInlineData,
  type GeminiUsageMetadata,
  type GeminiCandidate,
} from './providers/gemini/types.js'

// Error utilities
export {
  formatAPIError,
  extractConnectionErrorDetails,
  sanitizeAPIError,
  getSSLErrorHint,
  type ConnectionErrorDetails,
} from './errorUtils.js'

// Shared OpenAI conversion utilities
export { anthropicMessagesToOpenAI } from './shared/openaiConvertMessages.js'
export type { ConvertMessagesOptions } from './shared/openaiConvertMessages.js'
export { anthropicToolsToOpenAI, anthropicToolChoiceToOpenAI } from './shared/openaiConvertTools.js'
export { adaptOpenAIStreamToAnthropic } from './shared/openaiStreamAdapter.js'
