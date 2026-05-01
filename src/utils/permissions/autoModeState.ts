// 自动模式状态函数 —— 位于独立模块中，以便调用方可以根据 feature('TRANSCRIPT_CLASSIFIER') 有条件地 require()。

let autoModeActive = false
let autoModeFlagCli = false
// 由异步函数 verifyAutoModeGateAccess 在从 GrowthBook 读取到最新的 tengu_auto_mode_config.enabled === 'disabled' 时设置。
// 用于在踢出后阻止 isAutoModeGateEnabled() 允许 SDK/显式重新进入。
let autoModeCircuitBroken = false

export function setAutoModeActive(active: boolean): void {
  autoModeActive = active
}

export function isAutoModeActive(): boolean {
  return autoModeActive
}

export function setAutoModeFlagCli(passed: boolean): void {
  autoModeFlagCli = passed
}

export function getAutoModeFlagCli(): boolean {
  return autoModeFlagCli
}

export function setAutoModeCircuitBroken(broken: boolean): void {
  autoModeCircuitBroken = broken
}

export function isAutoModeCircuitBroken(): boolean {
  return autoModeCircuitBroken
}

export function _resetForTesting(): void {
  autoModeActive = false
  autoModeFlagCli = false
  autoModeCircuitBroken = false
}
