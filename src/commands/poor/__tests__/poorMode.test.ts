/**
 * Tests for fix: 修复穷鬼模式的写入问题
 *
 * Before the fix, poorMode was an in-memory boolean that reset on restart.
 * After the fix, it reads from / writes to settings.json via
 * getInitialSettings() and updateSettingsForSource().
 */
import { afterAll, describe, expect, test, beforeEach, mock } from 'bun:test'
import * as settingsModule from '../../../utils/settings/settings.js'

// ── 必须在导入被测模块之前声明模拟对象 ──────────

let mockSettings: Record<string, unknown> = {}
let lastUpdate: { source: string; patch: Record<string, unknown> } | null = null

mock.module('src/utils/settings/settings.js', () => ({
  loadManagedFileSettings: () => ({ settings: null, errors: [] }),
  getManagedFileSettingsPresence: () => ({
    hasBase: false,
    hasDropIns: false,
  }),
  parseSettingsFile: () => ({ settings: null, errors: [] }),
  getSettingsRootPathForSource: () => '',
  getSettingsFilePathForSource: () => undefined,
  getRelativeSettingsFilePathForSource: () => '',
  getInitialSettings: () => mockSettings,
  getSettingsForSource: () => mockSettings,
  getPolicySettingsOrigin: () => null,
  getSettingsWithErrors: () => ({ settings: mockSettings, errors: [] }),
  getSettingsWithSources: () => ({ effective: mockSettings, sources: [] }),
  getSettings_DEPRECATED: () => mockSettings,
  settingsMergeCustomizer: () => undefined,
  getManagedSettingsKeysForLogging: () => [],
  // Keep unrelated exports aligned with the real settings module so this
  // full-surface mock cannot change later test files if Bun keeps it alive.
  hasAutoModeOptIn: () => true,
  hasSkipDangerousModePermissionPrompt: () => false,
  getAutoModeConfig: () => undefined,
  getUseAutoModeDuringPlan: () => true,
  rawSettingsContainsKey: (key: string) => key in mockSettings,
  updateSettingsForSource: (source: string, patch: Record<string, unknown>) => {
    lastUpdate = { source, patch }
    mockSettings = { ...mockSettings, ...patch }
  },
}))

afterAll(() => {
  mock.restore()
  mock.module('src/utils/settings/settings.js', () => settingsModule)
})

// Import AFTER mocks are registered. The query suffix gives this file its own
// module instance so cross-file poorMode.js mocks cannot replace the subject
// under test during Bun's shared coverage run.
const poorModeModulePath = '../poorMode.js?poorModeTest'
const { isPoorModeActive, setPoorMode } = (await import(
  poorModeModulePath
)) as typeof import('../poorMode.js')

// ── 测试 ────────────────────────────────────────────────────────────────────

describe('isPoorModeActive — 首次调用时从设置中读取', () => {
  beforeEach(() => {
    lastUpdate = null
  })

  test('当 settings 中没有 poorMode 键时返回 false', () => {
    mockSettings = {}
    // 通过 setPoorMode 设置内部状态然后检查，强制重新读取
    setPoorMode(false)
    expect(isPoorModeActive()).toBe(false)
  })

  test('当 settings.poorMode === true 时返回 true', () => {
    mockSettings = { poorMode: true }
    setPoorMode(true)
    expect(isPoorModeActive()).toBe(true)
  })
})

describe('setPoorMode — 持久化到设置', () => {
  beforeEach(() => {
    lastUpdate = null
  })

  test('setPoorMode(true) 调用 updateSettingsForSource 并传入 poorMode: true', () => {
    setPoorMode(true)
    expect(lastUpdate).not.toBeNull()
    expect(lastUpdate!.source).toBe('userSettings')
    expect(lastUpdate!.patch.poorMode).toBe(true)
  })

  test('setPoorMode(false) 调用 updateSettingsForSource 并传入 poorMode: undefined（移除键）', () => {
    setPoorMode(false)
    expect(lastUpdate).not.toBeNull()
    expect(lastUpdate!.source).toBe('userSettings')
    // false || undefined === undefined — 应移除该键以保持设置整洁
    expect(lastUpdate!.patch.poorMode).toBeUndefined()
  })

  test('isPoorModeActive() 反映由 setPoorMode() 设置的值', () => {
    setPoorMode(true)
    expect(isPoorModeActive()).toBe(true)

    setPoorMode(false)
    expect(isPoorModeActive()).toBe(false)
  })

  test('多次切换保持一致性', () => {
    setPoorMode(true)
    setPoorMode(true)
    expect(isPoorModeActive()).toBe(true)

    setPoorMode(false)
    setPoorMode(false)
    expect(isPoorModeActive()).toBe(false)
  })
})
