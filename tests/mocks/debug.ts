/**
 * Shared mock for src/utils/debug.ts
 *
 * Cuts the bootstrap/state.ts dependency chain (module-level realpathSync + randomUUID).
 * Must be called via mock.module("src/utils/debug.ts", debugMock) BEFORE any import that
 * transitively depends on debug.ts.
 *
 * Exported as a factory so each call produces a fresh object (mock.module requirement).
 */
export function debugMock() {
  return {
    getMinDebugLogLevel: () => 'debug' as const,
    isDebugMode: () => false,
    enableDebugLogging: () => false,
    getDebugFilter: () => null,
    isDebugToStdErr: () => false,
    getDebugFilePath: () => null as string | null,
    setHasFormattedOutput: () => {},
    getHasFormattedOutput: () => false,
    flushDebugLogs: async () => {},
    logForDebugging: () => {},
    getDebugLogPath: () => '/tmp/mock-debug.log',
    logAntError: () => {},
  }
}
