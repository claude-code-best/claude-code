import type {
  ComputerUseHostAdapter,
  Logger,
} from '@ant/computer-use-mcp/types'
import { format } from 'util'
import { logForDebugging } from '../debug.js'
import { COMPUTER_USE_MCP_SERVER_NAME } from './common.js'
import { createCliExecutor } from './executor.js'
import { getChicagoEnabled, getChicagoSubGates } from './gates.js'

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
      // Use Bun FFI to call TCC APIs in-process so macOS checks the CURRENT
      // process's permissions (iTerm/Bun), not a subprocess like osascript.
      // Same dlopen pattern as packages/modifiers-napi/src/index.ts.
      try {
        const ffi = require('bun:ffi') as typeof import('bun:ffi')

        // AXIsProcessTrusted() — no args, checks accessibility for this process.
        const axLib = ffi.dlopen(
          '/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices',
          { AXIsProcessTrusted: { args: [], returns: ffi.FFIType.bool } },
        )
        const accessibility = Boolean(axLib.symbols.AXIsProcessTrusted())
        axLib.close()

        // CGPreflightScreenCaptureAccess() — checks screen recording without prompting (macOS 11+).
        const cgLib = ffi.dlopen(
          '/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics',
          { CGPreflightScreenCaptureAccess: { args: [], returns: ffi.FFIType.bool } },
        )
        const screenRecording = Boolean(cgLib.symbols.CGPreflightScreenCaptureAccess())
        cgLib.close()

        return accessibility && screenRecording
          ? { granted: true }
          : { granted: false, accessibility, screenRecording }
      } catch {
        // FFI unavailable (shouldn't happen on macOS with Bun) — assume granted.
        return { granted: true }
      }
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
