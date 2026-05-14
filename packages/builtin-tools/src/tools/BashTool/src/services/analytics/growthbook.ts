/** 从磁盘缓存读取 GrowthBook/门控配置（可能略旧）；与宿主 `getFeatureValue_CACHED_MAY_BE_STALE` 一致。 */
export type getFeatureValue_CACHED_MAY_BE_STALE =
  typeof import('src/services/analytics/growthbook.js').getFeatureValue_CACHED_MAY_BE_STALE
