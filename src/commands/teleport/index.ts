import type { Command } from '../../types/command.js'

const teleport: Command = {
  type: 'local-jsx',
  name: 'teleport',
  // Official v2.1.123 advertises alias `tp` (reverse-engineered from
  // claude.exe: `name:"teleport",aliases:["tp"]`). Keeping it for parity.
  aliases: ['tp'],
  description: 'Resume a Claude Code session from claude.ai',
  // REPL markdown renderer strips `<...>` as HTML tags — use uppercase.
  argumentHint: 'SESSION_ID',
  isHidden: false,
  isEnabled: () => true,
  bridgeSafe: false,
  getBridgeInvocationError: (_args: string) =>
    'teleport resumes the REPL and is not bridge-safe',
  load: async () => {
    const m = await import('./launchTeleport.js')
    return { call: m.callTeleport }
  },
}

export default teleport
