import type { Command } from '../../types/command.js';

const localVaultCommand: Command = {
  type: 'local-jsx',
  name: 'local-vault',
  aliases: ['lv', 'local-secret'],
  description:
    'Manage local encrypted secrets. Stored in OS keychain or encrypted file fallback — no API key required.',
  // Avoid `<key>` / `<value>` in the hint — REPL markdown renderer eats angle-
  // bracketed words as HTML tags. Uppercase placeholders survive intact.
  argumentHint: 'list | set KEY VALUE | get KEY [--reveal] | delete KEY',
  isHidden: false,
  isEnabled: () => true,
  bridgeSafe: true,
  load: async () => {
    const m = await import('./launchLocalVault.js');
    return { call: m.callLocalVault };
  },
};

export default localVaultCommand;
