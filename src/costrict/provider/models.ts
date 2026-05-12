/**
 * CoStrict 动态模型列表模块
 * 从 /ai-gateway/api/v1/models 获取可用模型，1小时缓存
 */

export interface CoStrictModel {
  id: string
  name?: string
  object?: string
  created?: number
  owned_by?: string
  supportsImages?: boolean
  contextWindow?: number
  maxTokens?: number
  maxTokensKey?: string
  creditConsumption?: number
  creditDiscount?: number
  [key: string]: any
}

interface ModelCache {
  models: CoStrictModel[]
  timestamp: number
}

let modelCache: ModelCache | null = null
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 小时

/**
 * 获取 CoStrict 可用模型列表
 */
export async function fetchCoStrictModels(
  baseUrl: string,
  accessToken: string,
): Promise<CoStrictModel[]> {
  if (modelCache && Date.now() - modelCache.timestamp < CACHE_TTL_MS) {
    return modelCache.models
  }

  try {
    const response = await fetch(`${baseUrl}/ai-gateway/api/v1/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'User-Agent': `csc/${MACRO.VERSION}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch models: HTTP ${response.status}`)
    }

    const data = (await response.json()) as { data?: CoStrictModel[] }
    const models = data.data || []

    if (models.length === 0) return getDefaultModels()

    modelCache = { models, timestamp: Date.now() }
    return models
  } catch {
    // 有旧缓存则使用旧缓存
    if (modelCache) return modelCache.models
    return getDefaultModels()
  }
}

function getDefaultModels(): CoStrictModel[] {
  return [
    { id: 'gpt-4', name: 'GPT-4' },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
  ]
}

export function clearModelCache(): void {
  modelCache = null
}

/**
 * 同步读取已缓存的模型列表（不发起网络请求）
 * 供 modelOptions.ts 等同步上下文使用
 */
export function getCachedCoStrictModels(): CoStrictModel[] {
  return modelCache?.models ?? []
}
