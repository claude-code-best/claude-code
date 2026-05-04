/** 省流模式状态 — 当激活时，跳过记忆提取和提示建议以降低令牌消耗。

持久化保存到 settings.json 文件中，以便在会话重启后依然有效。 */

import {
  getInitialSettings,
  updateSettingsForSource,
} from '../../utils/settings/settings.js'

let poorModeActive: boolean | null = null

export function isPoorModeActive(): boolean {
  if (poorModeActive === null) {
    poorModeActive = getInitialSettings().poorMode === true
  }
  return poorModeActive
}

export function setPoorMode(active: boolean): void {
  poorModeActive = active
  updateSettingsForSource('userSettings', {
    poorMode: active || undefined,
  })
}
