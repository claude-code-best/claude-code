import { getDefaultPermissionMode } from './runtime-state.js'

export const ACP_LINK_PERMISSION_MODE_ALIASES = {
  auto: 'auto',
  default: 'default',
  acceptedits: 'acceptEdits',
  dontask: 'dontAsk',
  plan: 'plan',
  bypasspermissions: 'bypassPermissions',
  bypass: 'bypassPermissions',
} as const

export type AcpLinkPermissionMode =
  (typeof ACP_LINK_PERMISSION_MODE_ALIASES)[keyof typeof ACP_LINK_PERMISSION_MODE_ALIASES]

export function resolveNewSessionPermissionMode(
  requestedMode: string | undefined,
  defaultMode: string | undefined,
): string | undefined {
  const requested = resolveAcpLinkPermissionMode(requestedMode)
  const localDefault = resolveAcpLinkPermissionMode(defaultMode)

  if (!requested) {
    return localDefault
  }

  if (requested !== 'bypassPermissions') {
    return requested
  }

  if (localDefault === 'bypassPermissions') {
    return 'bypassPermissions'
  }

  throw new Error(
    'bypassPermissions requires local ACP_PERMISSION_MODE=bypassPermissions before a client can request it.',
  )
}

export function resolveAcpLinkPermissionMode(
  mode: string | undefined,
): AcpLinkPermissionMode | undefined {
  if (mode === undefined) return undefined

  const normalized = mode?.trim().toLowerCase()
  if (!normalized) {
    throw new Error('Invalid permissionMode: expected a non-empty string.')
  }

  const resolved =
    ACP_LINK_PERMISSION_MODE_ALIASES[
      normalized as keyof typeof ACP_LINK_PERMISSION_MODE_ALIASES
    ]
  if (!resolved) {
    throw new Error(`Invalid permissionMode: ${mode}.`)
  }

  return resolved
}

export function buildAgentEnv(): NodeJS.ProcessEnv {
  const DEFAULT_PERMISSION_MODE = getDefaultPermissionMode()
  if (!DEFAULT_PERMISSION_MODE) {
    return process.env
  }

  return {
    ...process.env,
    ACP_PERMISSION_MODE: DEFAULT_PERMISSION_MODE,
  }
}
