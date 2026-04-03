/**
 * @ant/computer-use-mcp — Types
 *
 * Real type definitions reverse-engineered from call sites, replacing any stubs.
 */

export type CoordinateMode = 'pixels' | 'normalized'

export interface CuSubGates {
  pixelValidation: boolean
  clipboardPasteMultiline: boolean
  mouseAnimation: boolean
  hideBeforeAction: boolean
  autoTargetDisplay: boolean
  clipboardGuard: boolean
}

export interface Logger {
  silly(message: string, ...args: unknown[]): void
  debug(message: string, ...args: unknown[]): void
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
}

export interface CuPermissionRequest {
  apps: Array<{ bundleId: string; displayName: string }>
  requestedFlags: GrantFlags
  reason: string
  tccState: { accessibility: boolean; screenRecording: boolean }
  willHide: string[]
}

export interface GrantFlags {
  clipboardRead: boolean
  clipboardWrite: boolean
  systemKeyCombos: boolean
}

export interface CuPermissionResponse {
  granted: string[]
  denied: string[]
  flags: GrantFlags
}

export const DEFAULT_GRANT_FLAGS: GrantFlags = {
  clipboardRead: false,
  clipboardWrite: false,
  systemKeyCombos: false,
}

export interface ComputerUseConfig {
  coordinateMode: CoordinateMode
  enabledTools: string[]
}

export interface ComputerUseHostAdapter {
  serverName: string
  logger: Logger
  executor: ComputerExecutor
  ensureOsPermissions(): Promise<{ granted: true } | { granted: false; accessibility: boolean; screenRecording: boolean }>
  isDisabled(): boolean
  getSubGates(): CuSubGates
  getAutoUnhideEnabled(): boolean
  cropRawPatch?(base64: string, x: number, y: number, w: number, h: number): Promise<string>
}

export interface ComputerExecutor {
  capabilities: Record<string, boolean>
}
