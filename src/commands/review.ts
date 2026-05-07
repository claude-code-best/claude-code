import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.js'
import type { Command } from '../commands.js'
import type { ToolUseContext } from '../Tool.js'
import { isUltrareviewEnabled } from './review/ultrareviewEnabled.js'
import { CommandLocale } from 'src/costrict/command/locales/index.js'
import { PRIMARY_REVIEW_AGENT } from 'src/costrict/review/agent/builtin.js'

// Legal wants the explicit surface name plus a docs link visible before the
// user triggers, so the description carries "Claude Code on the web" + URL.
const CCR_TERMS_URL = 'https://costrict.ai/docs/en/claude-code-on-the-web'

const review: Command = {
  type: 'prompt',
  name: 'review',
  description: 'Review code for defects, security vulnerabilities, memory issues, and logic errors',
  progressMessage: 'reviewing code',
  contentLength: 0,
  source: 'builtin',
  agent: PRIMARY_REVIEW_AGENT || 'CoStrictReviewer',
  async getPromptForCommand(args, _context): Promise<ContentBlockParam[]> {
    return [{ type: 'text', text: CommandLocale.get('review').replace('$ARGUMENTS', args) }]
  },
}

const ultrareview: Command = {
  type: 'local-jsx',
  name: 'ultrareview',
  description: `~10–20 min · Finds and verifies bugs in your branch. Runs in CoStrict on the web. See ${CCR_TERMS_URL}`,
  isEnabled: () => isUltrareviewEnabled(),
  load: () => import('./review/ultrareviewCommand.js'),
}

export default review
export { ultrareview }
