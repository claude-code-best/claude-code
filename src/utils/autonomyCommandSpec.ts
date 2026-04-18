export const AUTONOMY_COMMAND_NAME = 'autonomy'

export const AUTONOMY_COMMAND_DESCRIPTION =
  'Inspect and manage automatic autonomy runs and flows'

export const AUTONOMY_ARGUMENT_HINT =
  '[status [--deep]|runs [limit]|flows [limit]|flow <id>|flow cancel <id>|flow resume <id>]'

export const AUTONOMY_USAGE =
  'Usage: /autonomy [status [--deep]|runs [limit]|flows [limit]|flow <id>|flow cancel <id>|flow resume <id>]'

export const AUTONOMY_CLI = {
  status: {
    command: 'status',
    description:
      'Print autonomy run, flow, team, pipe, and remote-control status',
  },
  runs: {
    command: 'runs [limit]',
    description: 'List recent autonomy runs',
  },
  flows: {
    command: 'flows [limit]',
    description: 'List recent autonomy flows',
  },
  flow: {
    command: 'flow',
    description: 'Inspect or manage a single autonomy flow',
    argument: '[flowId]',
    argumentDescription: 'Flow ID to inspect',
    usage: 'Usage: claude autonomy flow <flow-id>',
    cancel: {
      command: 'cancel <flowId>',
      description: 'Cancel a queued, waiting, or running autonomy flow',
    },
    resume: {
      command: 'resume <flowId>',
      description:
        'Resume a waiting autonomy flow and print the prepared prompt',
    },
  },
} as const

export type ParsedAutonomyCommand =
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
