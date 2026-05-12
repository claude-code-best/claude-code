import { getGlobalConfig } from '../../utils/config.js'
import type { Command } from '../../types/command.js'

const memoryStoresCommand: Command = {
  type: 'local-jsx',
  name: 'memory-stores',
  aliases: ['mem', 'mstore'],
  description:
    'Manage remote memory stores (cross-device memory persistence). Requires Claude Pro/Max/Team subscription.',
  // REPL markdown renderer strips `<...>` as HTML tags — use uppercase.
  argumentHint:
    'list | get ID | create NAME | archive ID | memories STORE_ID | create-memory STORE_ID CONTENT | get-memory STORE_ID MEMORY_ID | update-memory STORE_ID MEMORY_ID CONTENT | delete-memory STORE_ID MEMORY_ID | versions STORE_ID | redact STORE_ID VERSION_ID',
  // Visible when a workspace API key is available from env or saved settings.
  // Use a getter so getGlobalConfig() runs lazily (after enableConfigs())
  // instead of at module-load time, which races bootstrap and throws.
  get isHidden(): boolean {
    return (
      !process.env['ANTHROPIC_API_KEY'] && !getGlobalConfig().workspaceApiKey
    )
  },
  isEnabled: () => true,
  bridgeSafe: false,
  availability: ['claude-ai'],
  load: async () => {
    const m = await import('./launchMemoryStores.js')
    return { call: m.callMemoryStores }
  },
}

export default memoryStoresCommand
