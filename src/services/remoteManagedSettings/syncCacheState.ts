/**
 * Leaf state module for the remote-managed-settings sync cache.
 *
 * Split from syncCache.ts to break the settings.ts → syncCache.ts → auth.ts →
 * settings.ts cycle. auth.ts sits inside the large settings SCC; importing it
 * from settings.ts's own dependency chain pulls hundreds of modules into the
 * eagerly-evaluated SCC at startup.
 *
 * This module imports only leaves (path, envUtils, file, json, types,
 * settings/settingsCache — also a leaf, only type-imports validation). settings.ts
 * reads the cache from here. syncCache.ts keeps isRemoteManagedSettingsEligible
 * (the auth-touching part) and re-exports everything from here for callers that
 * don't care about the cycle.
 *
 * Eligibility is a tri-state here: undefined (not yet determined — return
 * null), false (ineligible — return null), true (proceed). managedEnv.ts
 * calls isRemoteManagedSettingsEligible() just before the policySettings
 * read — after userSettings/flagSettings env vars are applied, so the check
 * sees config-provided CLAUDE_CODE_USE_BEDROCK/ANTHROPIC_BASE_URL. That call
 * computes once and mirrors the result here via setEligibility(). Every
 * subsequent read hits the cached bool instead of re-running the auth chain.
 */

import { join } from 'path'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { readFileSync } from '../../utils/fileRead.js'
import { stripBOM } from '../../utils/jsonRead.js'
import { resetSettingsCache } from '../../utils/settings/settingsCache.js'
import type { SettingsJson } from '../../utils/settings/types.js'
import { jsonParse } from '../../utils/slowOperations.js'

const SETTINGS_FILENAME = 'remote-settings.json'

let sessionCache: SettingsJson | null = null
let eligible: boolean | undefined

export function setSessionCache(value: SettingsJson | null): void {
  sessionCache = value
}

export function resetSyncCache(): void {
  sessionCache = null
  eligible = undefined
}

export function setEligibility(v: boolean): boolean {
  eligible = v
  return v
}

export function getSettingsPath(): string {
  return join(getClaudeConfigHomeDir(), SETTINGS_FILENAME)
}

// 同步 I/O — 设置管道是同步的。fileRead 和 jsonRead 是叶子节点；
// file.ts 和 json.ts 都位于设置 SCC 中。
function loadSettings(): SettingsJson | null {
  try {
    const content = readFileSync(getSettingsPath())
    const data: unknown = jsonParse(stripBOM(content))
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return null
    }
    return data as SettingsJson
  } catch {
    return null
  }
}

export function getRemoteManagedSettingsSyncFromCache(): SettingsJson | null {
  if (eligible !== true) return null
  if (sessionCache) return sessionCache
  const cachedSettings = loadSettings()
  if (cachedSettings) {
    sessionCache = cachedSettings
// 远程设置首次变得可用。在此之前缓存的任何合并后的 getSettings_DEPRECATED()
//  结果都缺少 policySettings 层（上面的 `eligible !== true` 守卫返回了 null）。
// 刷新缓存，以便下一次合并读取时能够看到这一层并重新合并。
//
// 最多触发一次：后续调用会命中上面的 `if (sessionCache)`。
// 当从 loadSettingsFromDisk()（settings.ts:546）调用时，合并缓存仍为 null
// （setSessionSettingsCache 在 loadSettingsFromDisk 返回后的第 732 行运行）—— 无操作。
// 异步获取分支（index.ts 中的 setSessionCache + notifyChange）已自行处理重置。
//
// gh-23085: 在 main.tsx 的 Commander 定义时（在 preAction → init() → isRemoteManagedSettingsEligible() 之前）
// 调用的 isBridgeEnabled() 到达了 auth.ts:115 处的 getSettings_DEPRECATED()。
// bridgeEnabled 中的 try/catch 吞掉了后续 getGlobalConfig() 抛出的异常，但合并设置缓存已被污染。
// 参见 managedSettingsHeadless.int.test.ts。
    resetSettingsCache()
    return cachedSettings
  }
  return null
}
