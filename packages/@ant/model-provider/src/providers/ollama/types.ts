export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string
  thinking?: string
  tool_name?: string
  images?: string[]
  tool_calls?: OllamaToolCall[]
}

export interface OllamaTool {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters: Record<string, unknown>
  }
}

export interface OllamaToolCall {
  type?: 'function'
  function: {
    index?: number
    name: string
    arguments: Record<string, unknown>
  }
}

export interface OllamaChatRequest {
  model: string
  messages: OllamaMessage[]
  stream: boolean
  tools?: OllamaTool[]
  think?: boolean | 'high' | 'medium' | 'low'
  options?: {
    temperature?: number
    num_predict?: number
  }
}

export interface OllamaChatChunk {
  error?: string
  model?: string
  created_at?: string
  message?: {
    role?: 'assistant'
    content?: string
    thinking?: string
    tool_calls?: OllamaToolCall[]
  }
  done?: boolean
  done_reason?: string
  prompt_eval_count?: number
  eval_count?: number
}
