import { getGlobalConfig } from '../../utils/config.js'
import type { Command } from '../../types/command.js'

// Visible when a workspace API key is available from env or saved settings.
// Use a getter so getGlobalConfig() is called lazily (after enableConfigs()
// has run in the entry path) instead of at module-load time, which races
// the config-system bootstrap and throws "Config accessed before allowed".
const agentsPlatform: Command = {
  type: 'local-jsx',
  name: 'agents-platform',
  aliases: ['agents', 'schedule-agent'],
  description: 'Manage scheduled remote agents (cron-style triggers)',
  // REPL markdown renderer strips `<...>` as HTML tags — use uppercase.
  argumentHint: 'list | create CRON PROMPT | delete ID | run ID',
  get isHidden(): boolean {
    return (
      !process.env['ANTHROPIC_API_KEY'] && !getGlobalConfig().workspaceApiKey
    )
  },
  isEnabled: () => true,
  bridgeSafe: false,
  availability: ['claude-ai'],
  load: async () => {
    const m = await import('./launchAgentsPlatform.js')
    return { call: m.callAgentsPlatform }
  },
}

export default agentsPlatform
