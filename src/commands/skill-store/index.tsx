import { getGlobalConfig } from '../../utils/config.js';
import type { Command } from '../../types/command.js';

const skillStoreCommand: Command = {
  type: 'local-jsx',
  name: 'skill-store',
  aliases: ['ss', 'cloud-skills'],
  description:
    'Browse and install remote skills from the Anthropic skill marketplace. Requires Claude Pro/Max/Team subscription.',
  // REPL markdown renderer strips `<...>` as HTML tags — use uppercase.
  argumentHint:
    'list | get ID | versions ID | version ID VER | create NAME MARKDOWN | delete ID | install ID[@VERSION]',
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
    const m = await import('./launchSkillStore.js');
    return { call: m.callSkillStore };
  },
};

export default skillStoreCommand;
