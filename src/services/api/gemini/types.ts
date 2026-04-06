export const GEMINI_THOUGHT_SIGNATURE_FIELD = '_geminiThoughtSignature'

export type GeminiFunctionCall = {
  name?: string
  args?: Record<string, unknown>
}

export type GeminiFunctionResponse = {
  name?: string
  response?: Record<string, unknown>
}

export type GeminiInlineData = {
  mimeType: string
  data: string
}

export type GeminiPart = {
  text?: string
  thought?: boolean
  thoughtSignature?: string
  functionCall?: GeminiFunctionCall
  functionResponse?: GeminiFunctionResponse
  inlineData?: GeminiInlineData
}

export type GeminiContent = {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

export type GeminiFunctionDeclaration = {
  name: string
  description?: string
  parameters?: Record<string, unknown>
  parametersJsonSchema?: Record<string, unknown>
}

export type GeminiTool = {
  functionDeclarations: GeminiFunctionDeclaration[]
}

export type GeminiFunctionCallingConfig = {
  mode: 'AUTO' | 'ANY' | 'NONE'
  allowedFunctionNames?: string[]
}

export type GeminiGenerateContentRequest = {
  contents: GeminiContent[]
  systemInstruction?: {
    parts: Array<{ text: string }>
  }
  tools?: GeminiTool[]
  toolConfig?: {
    functionCallingConfig: GeminiFunctionCallingConfig
  }
  generationConfig?: {
    temperature?: number
    thinkingConfig?: {
      includeThoughts?: boolean
      thinkingBudget?: number
    }
  }
}

export type GeminiUsageMetadata = {
  promptTokenCount?: number
  candidatesTokenCount?: number
  thoughtsTokenCount?: number
  totalTokenCount?: number
}

export type GeminiCandidate = {
  content?: {
    role?: string
    parts?: GeminiPart[]
  }
  finishReason?: string
  index?: number
}

export type GeminiStreamChunk = {
  candidates?: GeminiCandidate[]
  usageMetadata?: GeminiUsageMetadata
  modelVersion?: string
}
