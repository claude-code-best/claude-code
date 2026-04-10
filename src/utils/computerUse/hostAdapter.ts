import type {
  ComputerUseHostAdapter,
  Logger,
} from '@ant/computer-use-mcp/types'
import { format } from 'util'
import { logForDebugging } from '../debug.js'
import { COMPUTER_USE_MCP_SERVER_NAME } from './common.js'
import { createCliExecutor } from './executor.js'
import { getChicagoEnabled, getChicagoSubGates } from './gates.js'
import { requireComputerUseSwift } from './swiftLoader.js'

class DebugLogger implements Logger {
  silly(message: string, ...args: unknown[]): void {
    logForDebugging(format(message, ...args), { level: 'debug' })
  }
  debug(message: string, ...args: unknown[]): void {
    logForDebugging(format(message, ...args), { level: 'debug' })
  }
  info(message: string, ...args: unknown[]): void {
    logForDebugging(format(message, ...args), { level: 'info' })
  }
  warn(message: string, ...args: unknown[]): void {
    logForDebugging(format(message, ...args), { level: 'warn' })
  }
  error(message: string, ...args: unknown[]): void {
    logForDebugging(format(message, ...args), { level: 'error' })
  }
}

// ---------------------------------------------------------------------------
// JXA-based TCC permission probes (fallback when native .node module absent)
// ---------------------------------------------------------------------------

/** Probe accessibility by asking System Events for a process list. */
function checkAccessibilityJXA(): boolean {
  try {
    const result = Bun.spawnSync({
      cmd: [
        'osascript',
        '-e',
        'tell application "System Events" to get name of every process whose background only is false',
      ],
      stdout: 'pipe',
      stderr: 'pipe',
    })
    return result.exitCode === 0
  } catch {
    return false
  }
}

/** Probe screen recording by attempting a 1x1 screencapture. */
function checkScreenRecordingJXA(): boolean {
  try {
    const result = Bun.spawnSync({
      cmd: ['screencapture', '-x', '-R', '0,0,1,1', '/dev/null'],
      stdout: 'pipe',
      stderr: 'pipe',
    })
    return result.exitCode === 0
  } catch {
    return false
  }
}

let cached: ComputerUseHostAdapter | undefined

/**
 * Process-lifetime singleton. Built once on first CU tool call; native modules
 * (both `@ant/computer-use-input` and `@ant/computer-use-swift`) are loaded
 * here via the executor factory, which throws on load failure — there is no
 * degraded mode.
 */
export function getComputerUseHostAdapter(): ComputerUseHostAdapter {
  if (cached) return cached
  cached = {
    serverName: COMPUTER_USE_MCP_SERVER_NAME,
    logger: new DebugLogger(),
    executor: createCliExecutor({
      getMouseAnimationEnabled: () => getChicagoSubGates().mouseAnimation,
      getHideBeforeActionEnabled: () => getChicagoSubGates().hideBeforeAction,
    }),
    ensureOsPermissions: async () => {
      if (process.platform !== 'darwin') return { granted: true }
      const cu = requireComputerUseSwift()
      const tcc = (cu as any).tcc
      // Native Swift .node module provides tcc.checkAccessibility/checkScreenRecording.
      // When absent (decompiled/reverse-engineered build), fall back to JXA probes.
      if (tcc) {
        const accessibility = tcc.checkAccessibility()
        const screenRecording = tcc.checkScreenRecording()
        return accessibility && screenRecording
          ? { granted: true }
          : { granted: false, accessibility, screenRecording }
      }
      // JXA fallback: try to query System Events (accessibility) and screencapture (screen recording).
      const accessibility = checkAccessibilityJXA()
      const screenRecording = checkScreenRecordingJXA()
      return accessibility && screenRecording
        ? { granted: true }
        : { granted: false, accessibility, screenRecording }
    },
    isDisabled: () => !getChicagoEnabled(),
    getSubGates: getChicagoSubGates,
    // cleanup.ts always unhides at turn end — no user preference to disable it.
    getAutoUnhideEnabled: () => true,

    // Pixel-validation JPEG decode+crop. MUST be synchronous (the package
    // does `patch1.equals(patch2)` directly on the return value). Cowork uses
    // Electron's `nativeImage` (sync); our `image-processor-napi` is
    // sharp-compatible and async-only. Returning null → validation skipped,
    // click proceeds — the designed fallback per `PixelCompareResult.skipped`.
    // The sub-gate defaults to false anyway.
    cropRawPatch: () => null,
  }
  return cached
}
