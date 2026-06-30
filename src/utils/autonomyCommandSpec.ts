export const AUTONOMY_COMMAND_NAME = 'autonomy'

export const AUTONOMY_ARGUMENT_HINT =
  '[status [--deep]|runs [limit]|flows [limit]|flow <id>|flow cancel <id>|flow resume <id>]'

export const AUTONOMY_USAGE =
  'Usage: /autonomy [status [--deep]|runs [limit]|flows [limit]|flow <id>|flow cancel <id>|flow resume <id>]'

type ParsedAutonomyCommand =
  | { type: 'status'; deep: boolean }
  | { type: 'runs'; limit?: string }
  | { type: 'flows'; limit?: string }
  | { type: 'flow-detail'; flowId: string }
  | { type: 'flow-cancel'; flowId: string }
  | { type: 'flow-resume'; flowId: string }
  | { type: 'usage' }

export function parseAutonomyArgs(args: string): ParsedAutonomyCommand {
  const [subcommand = 'status', arg1, arg2] = args.trim().split(/\s+/, 3)

  if (subcommand === '' || subcommand === 'status') {
    return { type: 'status', deep: arg1 === '--deep' }
  }

  if (subcommand === 'runs') {
    return { type: 'runs', limit: arg1 }
  }

  if (subcommand === 'flows') {
    return { type: 'flows', limit: arg1 }
  }

  if (subcommand === 'flow') {
    if (arg1 === 'cancel') {
      return arg2 ? { type: 'flow-cancel', flowId: arg2 } : { type: 'usage' }
    }
    if (arg1 === 'resume') {
      return arg2 ? { type: 'flow-resume', flowId: arg2 } : { type: 'usage' }
    }
    return arg1 ? { type: 'flow-detail', flowId: arg1 } : { type: 'usage' }
  }

  return { type: 'usage' }
}
