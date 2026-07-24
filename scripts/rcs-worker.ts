#!/usr/bin/env bun

/**
 * Lightweight self-hosted bridge worker entrypoint.
 *
 * The stack supervisor starts this module directly instead of going through
 * scripts/dev.ts and the full interactive CLI bootstrap.  It deliberately
 * does not create a session during startup: the first session work item is
 * the point at which a Claude CLI child is spawned.
 */
import { getBridgeAccessToken } from '../src/bridge/bridgeConfig.js'
import {
  BridgeHeadlessPermanentError,
  runBridgeHeadless,
} from '../src/bridge/bridgeMain.js'
import { buildSourceCliLaunchSpec } from './cli-launch.ts'

// Direct Bun execution does not pass through cli.tsx, so provide the small
// runtime MACRO surface used by bridge API registration and diagnostics.
if (typeof globalThis.MACRO === 'undefined') {
  globalThis.MACRO = {
    VERSION: process.env.CLAUDE_CODE_VERSION || '2.1.888',
    BUILD_TIME: new Date().toISOString(),
    FEEDBACK_CHANNEL: '',
    ISSUES_EXPLAINER: '',
    NATIVE_PACKAGE_URL: '',
    PACKAGE_URL: '',
    VERSION_CHANGELOG: '',
    COMPILED_FEATURES: [],
  }
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

function spawnMode(value: string | undefined): 'same-dir' | 'worktree' {
  return value === 'worktree' ? 'worktree' : 'same-dir'
}

const abortController = new AbortController()
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => abortController.abort())
}

const accessToken = (): string | undefined =>
  process.env.CLAUDE_BRIDGE_OAUTH_TOKEN || getBridgeAccessToken()

try {
  await runBridgeHeadless(
    {
      dir: process.env.RCS_WORKER_DIR || process.cwd(),
      name: process.env.RCS_WORKER_NAME || 'rcs-worker',
      spawnMode: spawnMode(process.env.CLAUDE_BRIDGE_SPAWN_MODE),
      capacity: positiveInteger(process.env.CLAUDE_BRIDGE_MAX_SESSIONS, 4),
      permissionMode: process.env.CLAUDE_BRIDGE_PERMISSION_MODE,
      sandbox: process.env.CLAUDE_BRIDGE_SANDBOX === '1',
      sessionTimeoutMs: positiveInteger(
        process.env.CLAUDE_BRIDGE_SESSION_TIMEOUT_MS,
        24 * 60 * 60 * 1000,
      ),
      createSessionOnStart:
        process.env.CLAUDE_BRIDGE_CREATE_SESSION_ON_START === '1',
      getAccessToken: accessToken,
      onAuth401: async failedToken =>
        accessToken() !== undefined && accessToken() !== failedToken,
      log: message => console.log(`[worker] ${message}`),
      sessionLaunchSpec: buildSourceCliLaunchSpec(
        process.env.RCS_WORKER_DIR || process.cwd(),
      ),
    },
    abortController.signal,
  )
} catch (error) {
  console.error(
    `[worker] ${error instanceof Error ? error.message : String(error)}`,
  )
  process.exitCode = error instanceof BridgeHeadlessPermanentError ? 78 : 1
}
