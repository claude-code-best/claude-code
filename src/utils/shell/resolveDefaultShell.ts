import { getInitialSettings } from '../settings/settings.js'
import { isVSCodeAcpWindows } from './shellToolUtils.js'

/**
 * Resolve the default shell for input-box `!` commands.
 *
 * Resolution order (docs/design/ps-shell-selection.md §4.2):
 *   settings.defaultShell → 'bash'
 *
 * Platform default is 'bash' everywhere except the VS Code ACP Windows sidebar.
 * In that host, native hidden PowerShell avoids Git Bash/WSL `eval` wrappers.
 */
export function resolveDefaultShell(): 'bash' | 'powershell' {
  const configured = getInitialSettings().defaultShell
  if (configured) return configured
  return isVSCodeAcpWindows() ? 'powershell' : 'bash'
}
