import { feature } from 'bun:bundle'
import { getKairosActive } from '../bootstrap/state.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'

/**
* KAIROS 功能的运行时限制。*
* 两层门控：
*   1. 构建时：必须启用“KAIROS”功能
*   2. 运行时：启用“tengu_kairos_assistant GrowthBook”标志（远程终止开关）*
在 main.tsx 中调用（在调用 setKairosActive(true) 之前）——切勿检查 kairosActive（这会导致死锁：门需要处于激活状态，而激活状态又需要依赖于门）。
调用者（main.tsx 第 1826 行至 1832 行）在该函数返回 true 后会设置 kairosActive。
*/
export async function isKairosEnabled(): Promise<boolean> {
  if (!feature('KAIROS')) {
    return false
  }
  if (!getFeatureValue_CACHED_MAY_BE_STALE('tengu_kairos_assistant', false)) {
    return false
  }
  return true
}
