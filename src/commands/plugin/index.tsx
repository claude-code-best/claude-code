import type { Command } from '../../commands.js';

const plugin = {
  type: 'local-jsx',
  name: 'plugin',
  aliases: ['plugins', 'marketplace'],
  description: '管理 Claude Code 插件',
  immediate: true,
  load: () => import('./plugin.js'),
} satisfies Command;

export default plugin;
