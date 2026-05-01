/**
 * Shared mock for src/utils/log.ts
 *
 * Cuts the bootstrap/state.ts dependency chain (module-level realpathSync + randomUUID).
 * Must be called via mock.module("src/utils/log.ts", logMock) BEFORE any import that
 * transitively depends on log.ts.
 *
 * Exported as a factory so each call produces a fresh object (mock.module requirement).
 */
export function logMock() {
  return {
    logError: () => {},
    getLogDisplayTitle: () => '',
    dateToFilename: (d: Date) => d.toISOString().replace(/[:.]/g, '-'),
    attachErrorLogSink: () => {},
    getInMemoryErrors: () => [] as Array<{ error: string; timestamp: string }>,
    loadErrorLogs: async () => [],
    getErrorLogByIndex: async () => null,
    logMCPError: () => {},
    logMCPDebug: () => {},
    captureAPIRequest: () => {},
    _resetErrorLogForTesting: () => {},
  }
}
