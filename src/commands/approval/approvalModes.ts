import type { PermissionMode } from '../../utils/permissions/PermissionMode.js'

export type ApprovalModeDescriptor = {
  mode: PermissionMode
  label: string
  description: string
  aliases: readonly string[]
}

export const APPROVAL_MODE_DESCRIPTORS: readonly ApprovalModeDescriptor[] = [
  {
    mode: 'default',
    label: 'Default',
    description: 'Ask before tools that need approval',
    aliases: ['default', 'ask', 'normal'],
  },
  {
    mode: 'acceptEdits',
    label: 'Accept edits',
    description: 'Auto-approve file edits, still ask for risky actions',
    aliases: ['accept-edits', 'acceptedits', 'accept', 'edits', 'edit'],
  },
  {
    mode: 'plan',
    label: 'Plan',
    description: 'Plan first, do not make changes until you approve',
    aliases: ['plan', 'planning'],
  },
  {
    mode: 'auto',
    label: 'Auto',
    description: 'Use the automatic approval classifier when available',
    aliases: ['auto', 'automatic'],
  },
  {
    mode: 'dontAsk',
    label: "Don't ask",
    description: 'Deny anything not already pre-approved',
    aliases: ['dont-ask', 'dontask', "don'task", "don't-ask", 'deny'],
  },
  {
    mode: 'bypassPermissions',
    label: 'Full access',
    description: 'Allow tool use without approval prompts',
    aliases: [
      'full-access',
      'bypasspermissions',
      'bypass-permissions',
      'bypass',
      'full',
      'fullaccess',
      'all',
      'allow-all',
      'unrestricted',
    ],
  },
]

export type ApprovalModeArgResult =
  | { type: 'current' }
  | { type: 'help' }
  | { type: 'mode'; mode: PermissionMode }
  | { type: 'invalid'; message: string }

const HELP_ARGS = new Set(['help', '-h', '--help'])
const CURRENT_ARGS = new Set(['', 'current', 'status', 'show'])

const MODE_BY_ALIAS = new Map<string, PermissionMode>(
  APPROVAL_MODE_DESCRIPTORS.flatMap(descriptor =>
    descriptor.aliases.map(
      alias => [normalizeApprovalArg(alias), descriptor.mode] as const,
    ),
  ),
)

export function normalizeApprovalArg(arg: string): string {
  return arg
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
}

export function parseApprovalModeArg(args: string): ApprovalModeArgResult {
  const normalized = normalizeApprovalArg(args)
  if (CURRENT_ARGS.has(normalized)) {
    return { type: 'current' }
  }
  if (HELP_ARGS.has(normalized)) {
    return { type: 'help' }
  }

  const mode = MODE_BY_ALIAS.get(normalized)
  if (mode) {
    return { type: 'mode', mode }
  }

  return {
    type: 'invalid',
    message: `Invalid approval mode: ${args}. Valid options are: default, accept-edits, plan, auto, dont-ask, full-access`,
  }
}

export function getApprovalModeDescriptor(
  mode: PermissionMode,
): ApprovalModeDescriptor {
  return (
    APPROVAL_MODE_DESCRIPTORS.find(descriptor => descriptor.mode === mode) ?? {
      mode,
      label: 'Internal/Unknown',
      description: 'This approval mode is internal and not user-selectable',
      aliases: [mode],
    }
  )
}

export function formatApprovalMode(mode: PermissionMode): string {
  const descriptor = getApprovalModeDescriptor(mode)
  return mode === 'bypassPermissions'
    ? `${descriptor.label} (${mode})`
    : descriptor.label
}
