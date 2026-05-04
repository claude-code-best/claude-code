import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/index.mjs';
import type { Command } from '../commands.js';
import { AGENT_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/AgentTool/constants.js';

const statusline = {
  type: 'prompt',
  description: '设置 Claude Code 的状态行用户界面',
  contentLength: 0, // 动态内容
  aliases: [],
  name: 'statusline',
  progressMessage: 'setting up statusLine',
  allowedTools: [AGENT_TOOL_NAME, 'Read(~/**)', 'Edit(~/.claude/settings.json)'],
  source: 'builtin',
  disableNonInteractive: true,
  async getPromptForCommand(args): Promise<ContentBlockParam[]> {
    const prompt = args.trim() || 'Configure my statusLine from my shell PS1 configuration';
    return [
      {
        type: 'text',
        text: `创建一个 subagent_type 为 "statusline-setup" 且提示为 "${prompt}" 的 ${AGENT_TOOL_NAME}`,
      },
    ];
  },
} satisfies Command;

export default statusline;
