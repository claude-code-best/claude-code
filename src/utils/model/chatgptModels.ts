export type ChatGPTCodexModelOption = {
  value: string
  label: string
  description: string
}

export const CHATGPT_CODEX_DEFAULT_MODEL = 'gpt-5.5'
export const CHATGPT_CODEX_FAST_MODEL = 'gpt-5.4-mini'

export const CHATGPT_CODEX_MODEL_OPTIONS: ChatGPTCodexModelOption[] = [
  {
    value: 'gpt-5.5',
    label: 'GPT-5.5',
    description:
      'Frontier model for complex coding, research, and real-world work',
  },
  {
    value: 'gpt-5.4',
    label: 'GPT-5.4',
    description: 'Strong model for everyday coding',
  },
  {
    value: 'gpt-5.4-mini',
    label: 'GPT-5.4-Mini',
    description:
      'Small, fast, and cost-efficient model for simpler coding tasks',
  },
  {
    value: 'gpt-5.3-codex',
    label: 'GPT-5.3-Codex',
    description: 'Coding-optimized model',
  },
  {
    value: 'gpt-5.3-codex-spark',
    label: 'GPT-5.3-Codex-Spark',
    description: 'Ultra-fast coding model',
  },
  {
    value: 'gpt-5.2',
    label: 'GPT-5.2',
    description: 'Optimized for professional work and long-running agents',
  },
]

export function isChatGPTAuthMode(): boolean {
  return process.env.OPENAI_AUTH_MODE === 'chatgpt'
}

export function isChatGPTCodexReasoningModel(model: string): boolean {
  const normalized = model.toLowerCase().replace(/\[1m\]$/, '')
  return CHATGPT_CODEX_MODEL_OPTIONS.some(
    option => option.value.toLowerCase() === normalized,
  )
}
