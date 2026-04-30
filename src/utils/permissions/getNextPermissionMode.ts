import type { ToolPermissionContext } from '../../Tool.js'
import { logForDebugging } from '../debug.js'
import type { PermissionMode } from './PermissionMode.js'
import { transitionPermissionMode } from './permissionSetup.js'

/**
 * Determines the next permission mode when cycling through modes with Shift+Tab.
 *
 * Unified cycle for all users (no USER_TYPE distinction):
 *   default → acceptEdits → plan → auto → bypassPermissions → default
 */
export function getNextPermissionMode(
  toolPermissionContext: ToolPermissionContext,
  _teamContext?: { leadAgentId: string },
): PermissionMode {
  switch (toolPermissionContext.mode) {
    case 'default':
      return 'acceptEdits'

    case 'acceptEdits':
      return 'plan'

    case 'plan':
      return 'auto'

    case 'auto':
      if (toolPermissionContext.isBypassPermissionsModeAvailable) {
        return 'bypassPermissions'
      }
      return 'default'

    case 'bypassPermissions':
      return 'default'

    case 'dontAsk':
      // Not exposed in UI cycle yet, but return default if somehow reached
      return 'default'

    default:
      // Covers any future modes — always fall back to default
      return 'default'
  }
}

/**
 * Computes the next permission mode and prepares the context for it.
 * Handles any context cleanup needed for the target mode (e.g., stripping
 * dangerous permissions when entering auto mode).
 *
 * @returns The next mode and the context to use (with dangerous permissions stripped if needed)
 */
export function cyclePermissionMode(
  toolPermissionContext: ToolPermissionContext,
  teamContext?: { leadAgentId: string },
): { nextMode: PermissionMode; context: ToolPermissionContext } {
  const nextMode = getNextPermissionMode(toolPermissionContext, teamContext)
  return {
    nextMode,
    context: transitionPermissionMode(
      toolPermissionContext.mode,
      nextMode,
      toolPermissionContext,
    ),
  }
}
