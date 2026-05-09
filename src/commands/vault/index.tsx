import { getGlobalConfig } from '../../utils/config.js';
import type { Command } from '../../types/command.js';

const vaultCommand: Command = {
  type: 'local-jsx',
  name: 'vault',
  aliases: ['vaults'],
  description:
    'Manage remote secret vaults and credentials for cloud agents. Requires Claude Pro/Max/Team subscription.',
  // REPL markdown renderer strips `<...>` as HTML tags — use uppercase.
  argumentHint:
    'list | create NAME | get ID | archive ID | add-credential VAULT_ID KEY VALUE | archive-credential VAULT_ID CRED_ID',
  // Visible when a workspace API key is available from env or saved settings.
  // Use a getter so getGlobalConfig() runs lazily (after enableConfigs())
  // instead of at module-load time, which races bootstrap and throws.
  get isHidden(): boolean {
    return !process.env['ANTHROPIC_API_KEY'] && !getGlobalConfig().workspaceApiKey;
  },
  isEnabled: () => true,
  bridgeSafe: false,
  availability: ['claude-ai'],
  load: async () => {
    const m = await import('./launchVault.js');
    return { call: m.callVault };
  },
};

export default vaultCommand;
