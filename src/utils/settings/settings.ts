import { feature } from 'bun:bundle'
import mergeWith from 'lodash-es/mergeWith.js'
import { dirname, join, resolve } from 'path'
import { z } from 'zod/v4'
import {
  getFlagSettingsInline,
  getFlagSettingsPath,
  getOriginalCwd,
  getUseCoworkPlugins,
} from '../../bootstrap/state.js'
import { getRemoteManagedSettingsSyncFromCache } from '../../services/remoteManagedSettings/syncCacheState.js'
import { uniq } from '../array.js'
import { logForDebugging } from '../debug.js'
import { logForDiagnosticsNoPII } from '../diagLogs.js'
import { getClaudeConfigHomeDir, isEnvTruthy } from '../envUtils.js'
import { getErrnoCode, isENOENT } from '../errors.js'
import { writeFileSyncAndFlush_DEPRECATED } from '../file.js'
import { readFileSync } from '../fileRead.js'
import { getFsImplementation, safeResolvePath } from '../fsOperations.js'
import { addFileGlobRuleToGitignore } from '../git/gitignore.js'
import { safeParseJSON } from '../json.js'
import { logError } from '../log.js'
import { getPlatform } from '../platform.js'
import { clone, jsonStringify } from '../slowOperations.js'
import { profileCheckpoint } from '../startupProfiler.js'
import {
  type EditableSettingSource,
  getEnabledSettingSources,
  type SettingSource,
} from './constants.js'
import { markInternalWrite } from './internalWrites.js'
import {
  getManagedFilePath,
  getManagedSettingsDropInDir,
} from './managedPath.js'
import { getHkcuSettings, getMdmSettings } from './mdm/settings.js'
import {
  getCachedParsedFile,
  getCachedSettingsForSource,
  getPluginSettingsBase,
  getSessionSettingsCache,
  resetSettingsCache,
  setCachedParsedFile,
  setCachedSettingsForSource,
  setSessionSettingsCache,
} from './settingsCache.js'
import { type SettingsJson, SettingsSchema } from './types.js'
import {
  filterInvalidPermissionRules,
  formatZodError,
  type SettingsWithErrors,
  type ValidationError,
} from './validation.js'

/** 根据当前平台获取托管设置文件的路径 */
function getManagedSettingsFilePath(): string {
  return join(getManagedFilePath(), 'managed-settings.json')
}

/** 加载基于文件的托管设置：managed-settings.json + managed-settings.d/*.json。
首先合并 managed-settings.json（优先级最低 / 基础），然后按字母顺序排序并合并增量文件（优先级更高，后合并的文件生效）。
这遵循 systemd/sudoers 的增量文件约定：基础文件提供默认值，增量文件进行自定义。不同团队可以独立发布策略片段
（例如 10-otel.json、20-security.json），而无需协调编辑单个管理员拥有的文件。
导出供测试使用。 */
export function loadManagedFileSettings(): {
  settings: SettingsJson | null
  errors: ValidationError[]
} {
  const errors: ValidationError[] = []
  let merged: SettingsJson = {}
  let found = false

  const { settings, errors: baseErrors } = parseSettingsFile(
    getManagedSettingsFilePath(),
  )
  errors.push(...baseErrors)
  if (settings && Object.keys(settings).length > 0) {
    merged = mergeWith(merged, settings, settingsMergeCustomizer)
    found = true
  }

  const dropInDir = getManagedSettingsDropInDir()
  try {
    const entries = getFsImplementation()
      .readdirSync(dropInDir)
      .filter(
        d =>
          (d.isFile() || d.isSymbolicLink()) &&
          d.name.endsWith('.json') &&
          !d.name.startsWith('.'),
      )
      .map(d => d.name)
      .sort()
    for (const name of entries) {
      const { settings, errors: fileErrors } = parseSettingsFile(
        join(dropInDir, name),
      )
      errors.push(...fileErrors)
      if (settings && Object.keys(settings).length > 0) {
        merged = mergeWith(merged, settings, settingsMergeCustomizer)
        found = true
      }
    }
  } catch (e) {
    const code = getErrnoCode(e)
    if (code !== 'ENOENT' && code !== 'ENOTDIR') {
      logError(e)
    }
  }

  return { settings: found ? merged : null, errors }
}

/** 检查存在哪些基于文件的托管设置源。
由 /status 端点使用，以显示 "(文件)"、"(增量文件)" 或 "(文件 + 增量文件)"。 */
export function getManagedFileSettingsPresence(): {
  hasBase: boolean
  hasDropIns: boolean
} {
  const { settings: base } = parseSettingsFile(getManagedSettingsFilePath())
  const hasBase = !!base && Object.keys(base).length > 0

  let hasDropIns = false
  const dropInDir = getManagedSettingsDropInDir()
  try {
    hasDropIns = getFsImplementation()
      .readdirSync(dropInDir)
      .some(
        d =>
          (d.isFile() || d.isSymbolicLink()) &&
          d.name.endsWith('.json') &&
          !d.name.startsWith('.'),
      )
  } catch {
    // 目录不存在
  }

  return { hasBase, hasDropIns }
}

/** 适当地处理文件系统错误
@param error 要处理的错误
@param path 导致错误的文件路径 */
function handleFileSystemError(error: unknown, path: string): void {
  if (
    typeof error === 'object' &&
    error &&
    'code' in error &&
    error.code === 'ENOENT'
  ) {
    logForDebugging(
      `在路径 ${path} 处遇到 settings.json 的损坏符号链接或缺失文件`,
    )
  } else {
    logError(error)
  }
}

/** 将设置文件解析为结构化格式
@param path 权限文件的路径
@param source 设置的来源（可选，用于错误报告）
@returns 解析后的设置数据和验证错误 */
export function parseSettingsFile(path: string): {
  settings: SettingsJson | null
  errors: ValidationError[]
} {
  const cached = getCachedParsedFile(path)
  if (cached) {
    // 克隆，以便调用方（例如 getSettingsForSourceUncached 中的 merg
    // eWith、updateSettingsForSource）无法修改缓存的条目。
    return {
      settings: cached.settings ? clone(cached.settings) : null,
      errors: cached.errors,
    }
  }
  const result = parseSettingsFileUncached(path)
  setCachedParsedFile(path, result)
  // 第一个返回值也要克隆 —— 调用方可能在另一个调用
  // 方读取同一缓存条目之前对其进行修改。
  return {
    settings: result.settings ? clone(result.settings) : null,
    errors: result.errors,
  }
}

function parseSettingsFileUncached(path: string): {
  settings: SettingsJson | null
  errors: ValidationError[]
} {
  try {
    const { resolvedPath } = safeResolvePath(getFsImplementation(), path)
    const content = readFileSync(resolvedPath)

    if (content.trim() === '') {
      return { settings: {}, errors: [] }
    }

    const data = safeParseJSON(content, false)

    // 在模式验证之前过滤无效的权限规则，以免一
    // 个错误规则导致整个设置文件被拒绝。
    const ruleWarnings = filterInvalidPermissionRules(data, path)

    const result = SettingsSchema().safeParse(data)

    if (!result.success) {
      const errors = formatZodError(result.error, path)
      return { settings: null, errors: [...ruleWarnings, ...errors] }
    }

    return { settings: result.data, errors: ruleWarnings }
  } catch (error) {
    handleFileSystemError(error, path)
    return { settings: null, errors: [] }
  }
}

/** 获取给定设置源关联文件根目录的绝对路径
（例如，对于 $PROJ_DIR/.claude/settings.json，返回 $PROJ_DIR）
@param source 设置的来源
@returns 设置文件的根路径 */
export function getSettingsRootPathForSource(source: SettingSource): string {
  switch (source) {
    case 'userSettings':
      return resolve(getClaudeConfigHomeDir()) //resolve返回绝对路径。
    case 'policySettings':
    case 'projectSettings':
    case 'localSettings': {
      return resolve(getOriginalCwd())
    }
    case 'flagSettings': {
      const path = getFlagSettingsPath()
      return path ? dirname(resolve(path)) : resolve(getOriginalCwd())
    }
  }
}

/** 根据协作模式获取用户设置文件名。
在协作模式下返回 'cowork_settings.json'，否则返回 'settings.json'。

优先级：
1. 会话状态（由 CLI 标志 --cowork 设置）
2. 环境变量 CLAUDE_CODE_USE_COWORK_PLUGINS
3. 默认值：'settings.json' */
function getUserSettingsFilePath(): string {
  if (
    getUseCoworkPlugins() ||
    isEnvTruthy(process.env.CLAUDE_CODE_USE_COWORK_PLUGINS)
  ) {
    return 'cowork_settings.json'
  }
  return 'settings.json'
}

export function getSettingsFilePathForSource(
  source: SettingSource,
): string | undefined {
  switch (source) {
    case 'userSettings':
      return join(
        getSettingsRootPathForSource(source),
        getUserSettingsFilePath(),
      )
    case 'projectSettings':
    case 'localSettings': {
      return join(
        getSettingsRootPathForSource(source),
        getRelativeSettingsFilePathForSource(source),
      )
    }
    case 'policySettings':
      return getManagedSettingsFilePath()
    case 'flagSettings': {
      return getFlagSettingsPath()
    }
  }
}

export function getRelativeSettingsFilePathForSource(
  source: 'projectSettings' | 'localSettings',
): string {
  switch (source) {
    case 'projectSettings':
      return join('.claude', 'settings.json')
    case 'localSettings':
      return join('.claude', 'settings.local.json')
  }
}

export function getSettingsForSource(
  source: SettingSource,
): SettingsJson | null {
  const cached = getCachedSettingsForSource(source)
  if (cached !== undefined) return cached
  const result = getSettingsForSourceUncached(source)
  setCachedSettingsForSource(source, result)
  return result
}

function getSettingsForSourceUncached(
  source: SettingSource,
): SettingsJson | null {
  // 对于 policySettings：第一个源胜出（远程 > HKLM/plist > 文件 > HKCU）
  if (source === 'policySettings') {
    const remoteSettings = getRemoteManagedSettingsSyncFromCache()
    if (remoteSettings && Object.keys(remoteSettings).length > 0) {
      return remoteSettings
    }

    const mdmResult = getMdmSettings()
    if (Object.keys(mdmResult.settings).length > 0) {
      return mdmResult.settings
    }

    const { settings: fileSettings } = loadManagedFileSettings()
    if (fileSettings) {
      return fileSettings
    }

    const hkcu = getHkcuSettings()
    if (Object.keys(hkcu.settings).length > 0) {
      return hkcu.settings
    }

    return null
  }

  const settingsFilePath = getSettingsFilePathForSource(source)
  const { settings: fileSettings } = settingsFilePath
    ? parseSettingsFile(settingsFilePath)
    : { settings: null }

  // 对于 flagSettings，合并通过 SDK 设置的任何内联设置
  if (source === 'flagSettings') {
    const inlineSettings = getFlagSettingsInline()
    if (inlineSettings) {
      const parsed = SettingsSchema().safeParse(inlineSettings)
      if (parsed.success) {
        return mergeWith(
          fileSettings || {},
          parsed.data,
          settingsMergeCustomizer,
        ) as SettingsJson
      }
    }
  }

  return fileSettings
}

/** 获取最高优先级活动策略设置源的来源。
采用“第一个源胜出”原则 —— 返回第一个有内容的源。
优先级：远程 > plist/hklm > 文件 (managed-settings.json) > hkcu */
export function getPolicySettingsOrigin():
  | 'remote'
  | 'plist'
  | 'hklm'
  | 'file'
  | 'hkcu'
  | null {
  // 1. 远程（最高）
  const remoteSettings = getRemoteManagedSettingsSyncFromCache()
  if (remoteSettings && Object.keys(remoteSettings).length > 0) {
    return 'remote'
  }

  // 2. 仅限管理员的 MDM（HKLM / macOS plist）
  const mdmResult = getMdmSettings()
  if (Object.keys(mdmResult.settings).length > 0) {
    return getPlatform() === 'macos' ? 'plist' : 'hklm'
  }

  // 3. managed-settings.json + managed-settings.d/（基于文件，需要管理员权限）
  const { settings: fileSettings } = loadManagedFileSettings()
  if (fileSettings) {
    return 'file'
  }

  // 4. HKCU（最低 —— 用户可写）
  const hkcu = getHkcuSettings()
  if (Object.keys(hkcu.settings).length > 0) {
    return 'hkcu'
  }

  return null
}

/** 使用 lodash mergeWith 将 `settings` 合并到 `source` 的现有设置中。

要从记录字段（例如 enabledPlugins、extraKnownMarketplaces）中删除一个键，
将其设置为 `undefined` —— 请勿使用 `delete`。mergeWith 仅在键存在且具有显式 `undefined` 值时才能检测到删除。 */
export function updateSettingsForSource(
  source: EditableSettingSource,
  settings: SettingsJson,
): { error: Error | null } {
  if (
    (source as unknown) === 'policySettings' ||
    (source as unknown) === 'flagSettings'
  ) {
    return { error: null }
  }

  // 如果需要，创建文件夹
  const filePath = getSettingsFilePathForSource(source)
  if (!filePath) {
    return { error: null }
  }

  try {
    getFsImplementation().mkdirSync(dirname(filePath))

    // 尝试获取带有验证的现有设置。绕过每个源的缓存 —— 下面的
    // mergeWith 会修改其目标（包括嵌套引用），如果在 r
    // esetSettingsCache() 之前写入失败，修改
    // 缓存对象会导致未持久化的状态泄漏。
    let existingSettings = getSettingsForSourceUncached(source)

    // 如果验证失败，检查文件是否存在但存在 JSON 语法错误
    if (!existingSettings) {
      let content: string | null = null
      try {
        content = readFileSync(filePath)
      } catch (e) {
        if (!isENOENT(e)) {
          throw e
        }
        // 文件不存在 —— 回退到与空设置合并
      }
      if (content !== null) {
        const rawData = safeParseJSON(content)
        if (rawData === null) {
          // JSON 语法错误 - 返回验证错误而不是覆盖。saf
          // eParseJSON 已经会记录错误，所以我们在这里只返回错误。
          return {
            error: new Error(
              `设置文件 ${filePath} 中存在无效的 JSON 语法`,
            ),
          }
        }
        if (rawData && typeof rawData === 'object') {
          existingSettings = rawData as SettingsJson
          logForDebugging(
            `由于验证失败，使用来自 ${filePath} 的原始设置`,
          )
        }
      }
    }

    const updatedSettings = mergeWith(
      existingSettings || {},
      settings,
      (
        _objValue: unknown,
        srcValue: unknown,
        key: string | number | symbol,
        object: Record<string | number | symbol, unknown>,
      ) => {
        // 将 undefined 视为删除
        if (srcValue === undefined && object && typeof key === 'string') {
          delete object[key]
          return undefined
        }
        // 对于数组，始终替换为提供的
        // 数组。这要求调用方负责计算期望的最终状态。
        if (Array.isArray(srcValue)) {
          return srcValue
        }
        // 对于非数组，让 lodash 处理默认的合并行为
        return undefined
      },
    )

    // 在写入文件前将其标记为内部写入
    markInternalWrite(filePath)

    writeFileSyncAndFlush_DEPRECATED(
      filePath,
      jsonStringify(updatedSettings, null, 2) + '\n',
    )

    // 由于设置已更新，使会话缓存失效
    resetSettingsCache()

    if (source === 'localSettings') {
      // 可以异步添加到 gitignore 而无需等待
      void addFileGlobRuleToGitignore(
        getRelativeSettingsFilePathForSource('localSettings'),
        getOriginalCwd(),
      )
    }
  } catch (e) {
    const error = new Error(
      `从 ${filePath} 读取原始设置失败: ${e}`,
    )
    logError(error)
    return { error }
  }

  return { error: null }
}

/** 数组的自定义合并函数 - 连接并去重 */
function mergeArrays<T>(targetArray: T[], sourceArray: T[]): T[] {
  return uniq([...targetArray, ...sourceArray])
}

/** 合并设置时用于 lodash mergeWith 的自定义合并函数。
数组会被连接并去重；其他值使用默认的 lodash 合并行为。
导出以供测试。 */
export function settingsMergeCustomizer(
  objValue: unknown,
  srcValue: unknown,
): unknown {
  if (Array.isArray(objValue) && Array.isArray(srcValue)) {
    return mergeArrays(objValue, srcValue)
  }
  // 返回 undefined 以让 lodash 处理默认合并行为
  return undefined
}

/** 从托管设置中获取一个设置键列表，用于日志记录。
对于某些嵌套设置（权限、沙箱、钩子），会展开显示
一级嵌套（例如 "permissions.allow"）。对于其他设置，
仅返回顶级键。

@param settings 要从中提取键的设置对象
@returns 排序后的键路径数组 */
export function getManagedSettingsKeysForLogging(
  settings: SettingsJson,
): string[] {
  // 使用 .strip() 仅获取有效的模式键
  const validSettings = SettingsSchema().strip().parse(settings) as Record<
    string,
    unknown
  >
  const keysToExpand = ['permissions', 'sandbox', 'hooks']
  const allKeys: string[] = []

  // 为我们展开的每个嵌套设置定义有效的嵌套键
  const validNestedKeys: Record<string, Set<string>> = {
    permissions: new Set([
      'allow',
      'deny',
      'ask',
      'defaultMode',
      'disableBypassPermissionsMode',
      ...(feature('TRANSCRIPT_CLASSIFIER') ? ['disableAutoMode'] : []),
      'additionalDirectories',
    ]),
    sandbox: new Set([
      'enabled',
      'failIfUnavailable',
      'allowUnsandboxedCommands',
      'network',
      'filesystem',
      'ignoreViolations',
      'excludedCommands',
      'autoAllowBashIfSandboxed',
      'enableWeakerNestedSandbox',
      'enableWeakerNetworkIsolation',
      'ripgrep',
    ]),
    // 对于钩子，我们使用带有枚举键的 z.record，因此我们单独验证
    hooks: new Set([
      'PreToolUse',
      'PostToolUse',
      'Notification',
      'UserPromptSubmit',
      'SessionStart',
      'SessionEnd',
      'Stop',
      'SubagentStop',
      'PreCompact',
      'PostCompact',
      'TeammateIdle',
      'TaskCreated',
      'TaskCompleted',
    ]),
  }

  for (const key of Object.keys(validSettings)) {
    if (
      keysToExpand.includes(key) &&
      validSettings[key] &&
      typeof validSettings[key] === 'object'
    ) {
      // 为这些特殊设置展开嵌套键（仅限一级深度）
      const nestedObj = validSettings[key] as Record<string, unknown>
      const validKeys = validNestedKeys[key]

      if (validKeys) {
        for (const nestedKey of Object.keys(nestedObj)) {
          // 仅包含已知的有效嵌套键
          if (validKeys.has(nestedKey)) {
            allKeys.push(`${key}.${nestedKey}`)
          }
        }
      }
    } else {
      // 对于其他设置，仅使用顶级键
      allKeys.push(key)
    }
  }

  return allKeys.sort()
}

// 防止加载设置时无限递归的标志
let isLoadingSettings = false

/** 不使用缓存从磁盘加载设置
这是实际从文件读取的原始实现 */
function loadSettingsFromDisk(): SettingsWithErrors {
  // 防止递归调用 loadSettingsFromDisk
  if (isLoadingSettings) {
    return { settings: {}, errors: [] }
  }

  const startTime = Date.now()
  profileCheckpoint('loadSettingsFromDisk_start')
  logForDiagnosticsNoPII('info', 'settings_load_started')

  isLoadingSettings = true
  try {
    // 从插件设置开始，作为优先级最低的基础。所有基于文
    // 件的源（用户、项目、本地、标志、策略）都会覆盖这些。插件设置仅包含
    // 允许列表中的键（例如，agent），这些键是有效的 SettingsJson 字段。
    const pluginSettings = getPluginSettingsBase()
    let mergedSettings: SettingsJson = {}
    if (pluginSettings) {
      mergedSettings = mergeWith(
        mergedSettings,
        pluginSettings,
        settingsMergeCustomizer,
      )
    }
    const allErrors: ValidationError[] = []
    const seenErrors = new Set<string>()
    const seenFiles = new Set<string>()

    // 按优先级顺序深度合并来自每个源的设置
    for (const source of getEnabledSettingSources()) {
      // policySettings: "首个有内容的源胜出" — 使用具有内容的最高优先级源。
      // 优先级：远程 > HKLM/plist > managed-settings.json > HKCU
      if (source === 'policySettings') {
        let policySettings: SettingsJson | null = null
        const policyErrors: ValidationError[] = []

        // 1. 远程（最高优先级）。remote-settings.json
        const remoteSettings = getRemoteManagedSettingsSyncFromCache()
        if (remoteSettings && Object.keys(remoteSettings).length > 0) {
          const result = SettingsSchema().safeParse(remoteSettings)
          if (result.success) {
            policySettings = result.data
          } else {
            // 远程存在但无效 — 即使我们回退，也要暴露错误
            policyErrors.push(
              ...formatZodError(result.error, '远程托管设置'),
            )
          }
        }

        // 2. 仅限管理员的 MDM（HKLM / macOS plist）
        if (!policySettings) {
          const mdmResult = getMdmSettings()
          if (Object.keys(mdmResult.settings).length > 0) {
            policySettings = mdmResult.settings
          }
          policyErrors.push(...mdmResult.errors)
        }

        // 3. managed-settings.json + managed-settings.d/（基于文件，需要管理员权限）
        if (!policySettings) {
          const { settings, errors } = loadManagedFileSettings()
          if (settings) {
            policySettings = settings
          }
          policyErrors.push(...errors)
        }

        // 4. HKCU（最低 — 用户可写，仅当上述源均不存在时）
        if (!policySettings) {
          const hkcu = getHkcuSettings()
          if (Object.keys(hkcu.settings).length > 0) {
            policySettings = hkcu.settings
          }
          policyErrors.push(...hkcu.errors)
        }

        // 将胜出的策略源合并到设置链中
        if (policySettings) {
          mergedSettings = mergeWith(
            mergedSettings,
            policySettings,
            settingsMergeCustomizer,
          )
        }
        for (const error of policyErrors) {
          const errorKey = `${error.file}:${error.path}:${error.message}`
          if (!seenErrors.has(errorKey)) {
            seenErrors.add(errorKey)
            allErrors.push(error)
          }
        }

        continue
      }

      const filePath = getSettingsFilePathForSource(source)
      if (filePath) {
        const resolvedPath = resolve(filePath)

        // 如果我们已从另一个源加载了此文件，则跳过
        if (!seenFiles.has(resolvedPath)) {
          seenFiles.add(resolvedPath)

          const { settings, errors } = parseSettingsFile(filePath)

          // 添加唯一错误（去重）
          for (const error of errors) {
            const errorKey = `${error.file}:${error.path}:${error.message}`
            if (!seenErrors.has(errorKey)) {
              seenErrors.add(errorKey)
              allErrors.push(error)
            }
          }

          if (settings) {
            mergedSettings = mergeWith(
              mergedSettings,
              settings,
              settingsMergeCustomizer,
            )
          }
        }
      }

      // 对于 flagSettings，同时合并通过 SDK 设置的任何内联设置
      if (source === 'flagSettings') {
        const inlineSettings = getFlagSettingsInline()
        if (inlineSettings) {
          const parsed = SettingsSchema().safeParse(inlineSettings)
          if (parsed.success) {
            mergedSettings = mergeWith(
              mergedSettings,
              parsed.data,
              settingsMergeCustomizer,
            )
          }
        }
      }
    }

    logForDiagnosticsNoPII('info', 'settings_load_completed', {
      duration_ms: Date.now() - startTime,
      source_count: seenFiles.size,
      error_count: allErrors.length,
    })

    return { settings: mergedSettings, errors: allErrors }
  } finally {
    isLoadingSettings = false
  }
}

/** 按优先级顺序从所有来源获取合并后的设置
设置按从低到高的优先级合并：
用户设置 -> 项目设置 -> 本地设置 -> 策略设置

此函数返回调用时设置的快照。
对于 React 组件，建议使用 useSettings() 钩子，以便在磁盘上的设置更改时进行响应式更新。

使用会话级缓存以避免重复的文件 I/O。
当通过 resetSettingsCache() 更改设置文件时，缓存将失效。

@returns 来自所有可用来源的合并设置（始终至少返回空对象） */
export function getInitialSettings(): SettingsJson {
  const { settings } = getSettingsWithErrors()
  return settings || {}
}

/** @deprecated 请改用 getInitialSettings()。此别名是为了向后兼容而存在。 */
export const getSettings_DEPRECATED = getInitialSettings

export type SettingsWithSources = {
  effective: SettingsJson
  /** 按从低到高的优先级排序 — 后面的条目会覆盖前面的条目。 */
  sources: Array<{ source: SettingSource; settings: SettingsJson }>
}

/** 获取有效的合并设置以及原始的按来源设置，
按合并优先级顺序。仅包含已启用且具有
非空内容的来源。

始终从磁盘重新读取 — 重置会话缓存，以便即使更改检测器尚未触发，
`effective` 和 `sources` 也能保持一致。 */
export function getSettingsWithSources(): SettingsWithSources {
  // 重置两个缓存，使 getSettingsForSource（按来源缓存）
  // 和 getInitialSettings（会话缓存）对当前磁盘状态达成一致。
  resetSettingsCache()
  const sources: SettingsWithSources['sources'] = []
  for (const source of getEnabledSettingSources()) {
    const settings = getSettingsForSource(source)
    if (settings && Object.keys(settings).length > 0) {
      sources.push({ source, settings })
    }
  }
  return { effective: getInitialSettings(), sources }
}

/** 从所有来源获取合并设置和验证错误
此函数现在使用会话级缓存以避免重复的文件 I/O。
设置更改需要重启 Claude Code，因此缓存在整个会话期间有效。
@returns 合并设置和遇到的所有验证错误 */
export function getSettingsWithErrors(): SettingsWithErrors {
  // 如果可用，则使用缓存结果
  const cached = getSessionSettingsCache()
  if (cached !== null) {
    return cached
  }

  // 从磁盘加载并缓存结果
  const result = loadSettingsFromDisk()
  profileCheckpoint('loadSettingsFromDisk_end')
  setSessionSettingsCache(result)
  return result
}

/** 检查任何原始设置文件是否包含特定键，无论验证如何。
这对于检测用户意图很有用，即使设置验证失败。
例如，如果用户设置了 cleanupPeriodDays 但在其他地方有验证错误，
我们可以检测到他们明确配置了清理，从而跳过清理，而不是
回退到默认值。 */
/** 如果任何受信任的设置来源已接受绕过
权限模式对话框，则返回 true。projectSettings 被有意排除 —
否则恶意项目可能会自动绕过对话框（RCE 风险）。 */
export function hasSkipDangerousModePermissionPrompt(): boolean {
  return !!(
    getSettingsForSource('userSettings')?.skipDangerousModePermissionPrompt ||
    getSettingsForSource('localSettings')?.skipDangerousModePermissionPrompt ||
    getSettingsForSource('flagSettings')?.skipDangerousModePermissionPrompt ||
    getSettingsForSource('policySettings')?.skipDangerousModePermissionPrompt
  )
}

/** 如果任何受信任的设置来源已接受自动
模式选择加入对话框，则返回 true。projectSettings 被有意排除 —
否则恶意项目可能会自动绕过对话框（RCE 风险）。 */
export function hasAutoModeOptIn(): boolean {
  // Auto mode is available to all users — no opt-in needed
  return true
}

/** 返回计划模式是否应使用自动模式语义。默认为 true
（选择退出）。如果任何受信任来源明确设置为 false，则返回 false。
排除 projectSettings，以便恶意项目无法控制此设置。 */
export function getUseAutoModeDuringPlan(): boolean {
  if (feature('TRANSCRIPT_CLASSIFIER')) {
    return (
      getSettingsForSource('policySettings')?.useAutoModeDuringPlan !== false &&
      getSettingsForSource('flagSettings')?.useAutoModeDuringPlan !== false &&
      getSettingsForSource('userSettings')?.useAutoModeDuringPlan !== false &&
      getSettingsForSource('localSettings')?.useAutoModeDuringPlan !== false
    )
  }
  return true
}

/** 从受信任的设置来源返回合并的 autoMode 配置。
仅在 TRANSCRIPT_CLASSIFIER 激活时可用；否则返回 undefined。
projectSettings 被有意排除 — 否则恶意项目可能
注入分类器允许/拒绝规则（RCE 风险）。 */
export function getAutoModeConfig():
  | { allow?: string[]; soft_deny?: string[]; environment?: string[] }
  | undefined {
  if (feature('TRANSCRIPT_CLASSIFIER')) {
    const schema = z.object({
      allow: z.array(z.string()).optional(),
      soft_deny: z.array(z.string()).optional(),
      deny: z.array(z.string()).optional(),
      environment: z.array(z.string()).optional(),
    })

    const allow: string[] = []
    const soft_deny: string[] = []
    const environment: string[] = []

    for (const source of [
      'userSettings',
      'localSettings',
      'flagSettings',
      'policySettings',
    ] as const) {
      const settings = getSettingsForSource(source)
      if (!settings) continue
      const result = schema.safeParse(
        (settings as Record<string, unknown>).autoMode,
      )
      if (result.success) {
        if (result.data.allow) allow.push(...result.data.allow)
        if (result.data.soft_deny) soft_deny.push(...result.data.soft_deny)
        if (process.env.USER_TYPE === 'ant') {
          if (result.data.deny) soft_deny.push(...result.data.deny)
        }
        if (result.data.environment)
          environment.push(...result.data.environment)
      }
    }

    if (allow.length > 0 || soft_deny.length > 0 || environment.length > 0) {
      return {
        ...(allow.length > 0 && { allow }),
        ...(soft_deny.length > 0 && { soft_deny }),
        ...(environment.length > 0 && { environment }),
      }
    }
  }
  return undefined
}

export function rawSettingsContainsKey(key: string): boolean {
  for (const source of getEnabledSettingSources()) {
    // 跳过 policySettings — 我们只关心用户配置的设置
    if (source === 'policySettings') {
      continue
    }

    const filePath = getSettingsFilePathForSource(source)
    if (!filePath) {
      continue
    }

    try {
      const { resolvedPath } = safeResolvePath(getFsImplementation(), filePath)
      const content = readFileSync(resolvedPath)
      if (!content.trim()) {
        continue
      }

      const rawData = safeParseJSON(content, false)
      if (rawData && typeof rawData === 'object' && key in rawData) {
        return true
      }
    } catch (error) {
      // 文件未找到是预期情况 — 并非所有设置文件都存
      // 在。其他错误（权限、I/O）应被跟踪。
      handleFileSystemError(error, filePath)
    }
  }

  return false
}
