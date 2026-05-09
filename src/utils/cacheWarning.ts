import { randomUUID } from 'crypto'
import { getInitialSettings } from './settings/settings.js'
import type { Message } from '../types/message.js'

// Usage 类型（从 API 响应中提取）
interface Usage {
  input_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
}

export interface CacheHitRateInfo {
  hitRate: number
  threshold: number
  trend: number | null // 正数=上升，负数=下降
  shouldWarn: boolean
}

interface CacheWarningState {
  lastHitRate: number | null
  lastTimestamp: number | null
}

// 模块级状态，每个 querySource 独立跟踪
const cacheWarningStateBySource = new Map<string, CacheWarningState>()

const DEFAULT_CACHE_THRESHOLD = 80

/**
 * 从 settings.json 读取缓存阈值配置
 */
export function getCacheThreshold(): number {
  const settings = getInitialSettings()
  return settings.cacheThreshold ?? DEFAULT_CACHE_THRESHOLD
}

/**
 * 计算缓存命中率
 * 返回值范围 0-100，null 表示无有效数据
 */
export function calculateCacheHitRate(
  usage: Usage | null | undefined,
): number | null {
  if (!usage) return null

  const { input_tokens, cache_creation_input_tokens, cache_read_input_tokens } =
    usage

  // 所有缓存字段为 0 表示无缓存数据
  if (cache_read_input_tokens === 0 && cache_creation_input_tokens === 0) {
    return null
  }

  const totalInputTokens =
    input_tokens + cache_creation_input_tokens + cache_read_input_tokens
  if (totalInputTokens === 0) return null

  return (cache_read_input_tokens / totalInputTokens) * 100
}

/**
 * 检测是否需要显示缓存警告
 * @param usage API usage 数据
 * @param querySource 查询来源（用于独立跟踪状态）
 * @param threshold 缓存阈值百分比
 * @returns 警告信息，如果不需要警告则返回 null
 */
export function shouldShowCacheWarning(
  usage: Usage | null | undefined,
  querySource: string,
  threshold: number,
): CacheHitRateInfo | null {
  const hitRate = calculateCacheHitRate(usage)

  // 无缓存数据
  if (hitRate === null) {
    return null
  }

  // 获取或初始化该 querySource 的状态
  let state = cacheWarningStateBySource.get(querySource)
  if (!state) {
    state = { lastHitRate: null, lastTimestamp: null }
    cacheWarningStateBySource.set(querySource, state)
  }

  // 首次请求不显示警告
  if (state.lastHitRate === null) {
    state.lastHitRate = hitRate
    state.lastTimestamp = Date.now()
    return null
  }

  // 计算趋势
  const trend = hitRate - state.lastHitRate

  // 更新状态
  state.lastHitRate = hitRate
  state.lastTimestamp = Date.now()

  // 检查是否需要警告
  if (hitRate < threshold) {
    return { hitRate, threshold, trend, shouldWarn: true }
  }

  return null
}

/**
 * 生成缓存警告消息
 * @param info 缓存警告信息
 * @returns system 类型消息，在 REPL 主界面和 transcript 模式下可见
 */
export function createCacheWarningMessage(info: CacheHitRateInfo): Message {
  const { hitRate, threshold, trend } = info

  let content = `Cache hit rate ${hitRate.toFixed(0)}%, below ${threshold}% threshold`

  if (trend !== null && Math.abs(trend) > 0.1) {
    const trendIcon = trend > 0 ? '^' : 'v'
    const trendPercent = Math.abs(trend).toFixed(0)
    content += ` (${trendIcon}${trendPercent}%)`
  }

  return {
    type: 'system',
    subtype: 'cache_warning',
    level: 'warning' as const,
    content,
    timestamp: new Date().toISOString(),
    uuid: randomUUID(),
    isMeta: false,
  } as Message
}
