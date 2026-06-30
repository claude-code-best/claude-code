/**
 * Domestic (China) LLM provider presets with URLs, pricing, and model data.
 * All providers are OpenAI-compatible — just swap baseURL + apiKey.
 */

export type ProviderModel = {
  id: string
  label: string
  inputPricePerMTok: number
  outputPricePerMTok: number
  contextWindow: string
  free?: boolean
  tags?: string[]
  deprecated?: string
}

export type CodingPlanTier = {
  id: string
  label: string
  price: string
  credits: string
  description: string
}

export type ProviderPreset = {
  id: string
  label: string
  description: string
  icon: string
  baseURL: string
  apiKeyPage: string
  modelsPage: string
  freeTier: string
  keyFormat: string
  codingPlan?: {
    baseURL: string
    keyFormat: string
    purchasePage: string
    tiers: CodingPlanTier[]
  }
  models: ProviderModel[]
}

export const CHINA_LLM_PROVIDERS: ProviderPreset[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    description: 'Cheapest pricing, best code, 5M free tokens',
    icon: '\u{1F525}',
    baseURL: 'https://api.deepseek.com',
    apiKeyPage: 'https://platform.deepseek.com/api_keys',
    modelsPage: 'https://api-docs.deepseek.com/zh-cn/',
    freeTier: '5M tokens on signup (30 days), min top-up ¥10',
    keyFormat: 'sk-...',
    models: [
      {
        id: 'deepseek-v4-pro',
        label: 'DeepSeek V4 Pro',
        inputPricePerMTok: 3,
        outputPricePerMTok: 6,
        contextWindow: '1M',
        tags: ['Recommended', 'Best code'],
      },
      {
        id: 'deepseek-v4-flash',
        label: 'DeepSeek V4 Flash',
        inputPricePerMTok: 1,
        outputPricePerMTok: 2,
        contextWindow: '1M',
        tags: ['Fast'],
      },
    ],
  },
  {
    id: 'zhipu',
    label: 'Zhipu GLM',
    description: 'Free models, Coding Plan, strong reasoning',
    icon: '\u{1F9E0}',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    apiKeyPage: 'https://open.bigmodel.cn/user/apiKeys',
    modelsPage: 'https://docs.bigmodel.cn/cn/guide/start/model-overview',
    freeTier: 'GLM-4.7-Flash / GLM-Z1-Flash free forever',
    keyFormat: '{id}.{secret}',
    codingPlan: {
      baseURL: 'https://open.bigmodel.cn/api/coding/paas/v4',
      keyFormat: '{id}.{secret}',
      purchasePage: 'https://bigmodel.cn/claude-code',
      tiers: [
        {
          id: 'lite',
          label: 'Lite',
          price: '¥72/mo ($30/quarter)',
          credits: '~400 prompts/week',
          description: 'GLM-5.1/5-Turbo/4.7/4.5-Air, MCP tools',
        },
        {
          id: 'pro',
          label: 'Pro',
          price: '¥216/mo ($90/quarter)',
          credits: '~2000 prompts/week',
          description: 'Lite + GLM-5, 5x quota',
        },
        {
          id: 'max',
          label: 'Max',
          price: '¥576/mo ($240/quarter)',
          credits: '~8000 prompts/week',
          description: '4x Pro quota for heavy use',
        },
      ],
    },
    models: [
      {
        id: 'glm-5.1',
        label: 'GLM-5.1',
        inputPricePerMTok: 10.1,
        outputPricePerMTok: 31.7,
        contextWindow: '203K',
        tags: ['Flagship'],
      },
      {
        id: 'glm-4.7',
        label: 'GLM-4.7',
        inputPricePerMTok: 4.3,
        outputPricePerMTok: 15.8,
        contextWindow: '205K',
        tags: ['Recommended'],
      },
      {
        id: 'glm-4.7-flash',
        label: 'GLM-4.7 Flash',
        inputPricePerMTok: 0,
        outputPricePerMTok: 0,
        contextWindow: '203K',
        free: true,
        tags: ['Free forever'],
      },
    ],
  },
  {
    id: 'qwen',
    label: 'Tongyi Qianwen',
    description: 'Alibaba Cloud, Coding Plan, 90-day free tier',
    icon: '☁️',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKeyPage: 'https://bailian.console.aliyun.com',
    modelsPage:
      'https://help.aliyun.com/zh/model-studio/getting-started/models',
    freeTier: '90-day free tier for all models after activation',
    keyFormat: 'sk-...',
    codingPlan: {
      baseURL: 'https://coding.dashscope.aliyuncs.com/v1',
      keyFormat: 'sk-sp-...',
      purchasePage: 'https://bailian.console.aliyun.com',
      tiers: [
        {
          id: 'pro',
          label: 'Pro',
          price: '¥200/mo',
          credits: 'Includes Qwen/GLM/Kimi/MiniMax models',
          description: 'Entry tier (Lite discontinued 2026/03)',
        },
      ],
    },
    models: [
      {
        id: 'qwen3-max',
        label: 'Qwen3 Max',
        inputPricePerMTok: 2.5,
        outputPricePerMTok: 10,
        contextWindow: '262K',
        tags: ['Flagship'],
      },
      {
        id: 'qwen3.5-plus',
        label: 'Qwen3.5 Plus',
        inputPricePerMTok: 0.8,
        outputPricePerMTok: 4.8,
        contextWindow: '1M',
        tags: ['Recommended', 'Value'],
      },
      {
        id: 'qwen3.5-flash',
        label: 'Qwen3.5 Flash',
        inputPricePerMTok: 0.2,
        outputPricePerMTok: 2,
        contextWindow: '1M',
        tags: ['Fast'],
      },
    ],
  },
  {
    id: 'mimo',
    label: 'MiMo Xiaomi',
    description: '1M context, 128K output, Token Plan, open source',
    icon: '\u{1F4F1}',
    baseURL: 'https://api.xiaomimimo.com/v1',
    apiKeyPage: 'https://platform.xiaomimimo.com/api-keys',
    modelsPage: 'https://platform.xiaomimimo.com/models',
    freeTier: 'Credits for new users, mimo-v2-flash low cost',
    keyFormat: 'sk-...',
    codingPlan: {
      baseURL: 'https://token-plan-cn.xiaomimimo.com/v1',
      keyFormat: 'tp-...',
      purchasePage: 'https://platform.xiaomimimo.com/token-plan',
      tiers: [
        {
          id: 'lite',
          label: 'Lite',
          price: '¥39/mo ($6/mo)',
          credits: '4.1B Credits/mo',
          description: 'Light use, all MiMo models',
        },
        {
          id: 'standard',
          label: 'Standard',
          price: '¥99/mo ($16/mo)',
          credits: '11B Credits/mo',
          description: '2.7x Lite, daily coding',
        },
        {
          id: 'pro',
          label: 'Pro',
          price: '¥329/mo ($50/mo)',
          credits: '38B Credits/mo',
          description: '9x Lite, heavy complex projects',
        },
        {
          id: 'max',
          label: 'Max',
          price: '¥659/mo ($100/mo)',
          credits: '82B Credits/mo',
          description: '20x Lite, team-level usage',
        },
      ],
    },
    models: [
      {
        id: 'mimo-v2.5-pro',
        label: 'MiMo V2.5 Pro',
        inputPricePerMTok: 3,
        outputPricePerMTok: 6,
        contextWindow: '1M',
        tags: ['Recommended', 'Flagship'],
      },
      {
        id: 'mimo-v2.5',
        label: 'MiMo V2.5',
        inputPricePerMTok: 1,
        outputPricePerMTok: 2,
        contextWindow: '1M',
        tags: ['Multimodal'],
      },
      {
        id: 'mimo-v2-flash',
        label: 'MiMo V2 Flash',
        inputPricePerMTok: 0.7,
        outputPricePerMTok: 2.1,
        contextWindow: '256K',
        tags: ['Fast'],
      },
    ],
  },
]

export function findChinaProviderById(id: string): ProviderPreset | undefined {
  return CHINA_LLM_PROVIDERS.find(p => p.id === id)
}

export function resolveChinaProviderBaseURL(
  providerId: string,
  mode: 'api' | 'coding-plan',
): string {
  const provider = findChinaProviderById(providerId)
  if (!provider) return ''
  if (mode === 'coding-plan' && provider.codingPlan) {
    return provider.codingPlan.baseURL
  }
  return provider.baseURL
}
