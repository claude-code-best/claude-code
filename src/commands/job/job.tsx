import type { LocalJSXCommandOnDone, LocalJSXCommandContext } from '../../types/command.js'

/**
 * /job slash command — manages template jobs from inside the REPL.
 *
 * Subcommands: list | new <template> [args] | reply <id> <text> | status <id>
 * Default (no args): list
 */
export async function call(
  onDone: LocalJSXCommandOnDone,
  _context: LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode> {
  const parts = args ? args.trim().split(/\s+/) : []
  const sub = parts[0] || 'list'

  // Capture console output so we can return it as onDone text
  const lines: string[] = []
  const origLog = console.log
  const origError = console.error
  console.log = (...a: unknown[]) => lines.push(a.map(String).join(' '))
  console.error = (...a: unknown[]) => lines.push(a.map(String).join(' '))

  try {
    const { templatesMain } = await import('../../cli/handlers/templateJobs.js')
    await templatesMain([sub, ...parts.slice(1)])
  } finally {
    console.log = origLog
    console.error = origError
  }

  onDone(lines.join('\n') || 'Done.', { display: 'system' })
  return null
}
