import type { PermissionMode } from '../../../types/permissions.js'
import { resolvePermissionMode } from '../utils.js'

export const permissionModeIds: readonly PermissionMode[] = [
  'auto',
  'default',
  'acceptEdits',
  'bypassPermissions',
  'dontAsk',
  'plan',
]

export function isPermissionMode(modeId: string): modeId is PermissionMode {
  return (permissionModeIds as readonly string[]).includes(modeId)
}

export function resolveSessionPermissionMode(
  metaMode: unknown,
  hasMetaMode: boolean,
  settingsMode: unknown,
): PermissionMode {
  if (hasMetaMode) {
    const metaResolved = resolveRequiredPermissionMode(
      metaMode,
      '_meta.permissionMode',
    )
    if (
      metaResolved === 'bypassPermissions' &&
      !isAcpBypassPermissionModeAvailable()
    ) {
      throw new Error(
        'Mode not available: bypassPermissions cannot run as root (start the agent as a non-root user, or set IS_SANDBOX=1).',
      )
    }

    return metaResolved
  }

  const settingsResolved = resolveConfiguredPermissionMode(settingsMode)
  return settingsResolved ?? 'default'
}

function resolveRequiredPermissionMode(
  mode: unknown,
  source: string,
): PermissionMode {
  if (mode === undefined || mode === null) {
    throw new Error(`Invalid ${source}: expected a string.`)
  }

  return resolvePermissionMode(mode, source) as PermissionMode
}

function resolveConfiguredPermissionMode(
  mode: unknown,
): PermissionMode | undefined {
  if (mode === undefined || mode === null) return undefined

  try {
    return resolvePermissionMode(
      mode,
      'permissions.defaultMode',
    ) as PermissionMode
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err)
    console.error(
      '[ACP] Invalid permissions.defaultMode, using default:',
      reason,
    )
    return undefined
  }
}

export function hasOwnField(
  value: Record<string, unknown> | null | undefined,
  key: string,
): boolean {
  return !!value && Object.hasOwn(value, key)
}

/**
 * Whether bypassPermissions is selectable by ACP clients.
 *
 * The previous implementation required a local opt-in (ACP_PERMISSION_MODE env var,
 * CLAUDE_CODE_ACP_ALLOW_BYPASS_PERMISSIONS env var, or settings.permissions.defaultMode).
 * That gate made the mode invisible to standard clients unless the operator already
 * pre-configured it — defeating the point of exposing it through the ACP mode list.
 *
 * The only remaining guard is the process-level one: bypass must not silently run
 * as root (where every skipped permission check is a privilege boundary crossed),
 * unless explicitly marked as a sandbox.
 */
export function isAcpBypassPermissionModeAvailable(): boolean {
  return isProcessBypassPermissionModeAvailable()
}

function isProcessBypassPermissionModeAvailable(): boolean {
  if (process.env.IS_SANDBOX) return true
  if (typeof process.geteuid === 'function') return process.geteuid() !== 0
  if (typeof process.getuid === 'function') return process.getuid() !== 0
  return true
}
