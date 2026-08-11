import { getInitialSettings } from '../settings/settings.js'
import { getPlatform } from '../platform.js'
import { isPowerShellToolEnabled } from './shellToolUtils.js'

/**
 * Resolve the default shell for input-box `!` commands and agent preference.
 *
 * Resolution order:
 *   1. settings.defaultShell (explicit user/project setting)
 *   2. Windows + PowerShell tool enabled → 'powershell'
 *   3. otherwise → 'bash'
 *
 * Opt out of the Windows PowerShell default via settings.defaultShell=bash
 * or CLAUDE_CODE_USE_POWERSHELL_TOOL=0 (disables the PowerShell tool entirely).
 */
export function resolveDefaultShell(): 'bash' | 'powershell' {
  const configured = getInitialSettings().defaultShell
  if (configured === 'bash' || configured === 'powershell') {
    return configured
  }
  if (getPlatform() === 'windows' && isPowerShellToolEnabled()) {
    return 'powershell'
  }
  return 'bash'
}
