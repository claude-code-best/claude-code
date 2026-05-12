import { feature } from 'bun:bundle'
import type { Command } from '../../types/command.js'

// `feature()` from bun:bundle can only appear directly inside an if statement
// or ternary condition (Bun macro restriction). A named function with a
// `return feature(...)` body is the cleanest way to satisfy this constraint
// while keeping the Command object readable.
function isAutofixPrEnabled(): boolean {
  return feature('AUTOFIX_PR') ? true : false
}

const autofixPr: Command = {
  type: 'local-jsx',
  name: 'autofix-pr',
  description: 'Auto-fix CI failures on a pull request',
  // Avoid `<x>` in hints — REPL markdown renderer eats angle-bracketed
  // tokens as HTML tags. Uppercase placeholders survive intact.
  argumentHint: 'PR_NUMBER | stop | OWNER/REPO#N',
  isEnabled: isAutofixPrEnabled,
  isHidden: false,
  bridgeSafe: true,
  getBridgeInvocationError: (args: string) => {
    const trimmed = args.trim()
    if (!trimmed) return 'PR number required, e.g. /autofix-pr 386'
    if (trimmed === 'stop' || trimmed === 'off') return undefined
    if (/^[1-9]\d{0,9}$/.test(trimmed)) return undefined
    if (/^[\w.-]+\/[\w.-]+#[1-9]\d{0,9}$/.test(trimmed)) return undefined
    return 'Invalid args. Use /autofix-pr <pr-number> | stop | <owner>/<repo>#<n>'
  },
  load: async () => {
    const m = await import('./launchAutofixPr.js')
    return { call: m.callAutofixPr }
  },
}

export default autofixPr
