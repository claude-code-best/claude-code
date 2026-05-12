import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.js'
import type { Command } from '../commands.js'
import type { ToolUseContext } from '../Tool.js'
import { isUltrareviewEnabled } from './review/ultrareviewEnabled.js'
import { CommandLocale } from 'src/costrict/command/locales/index.js'

// Legal wants the explicit surface name plus a docs link visible before the
// user triggers, so the description carries "Claude Code on the web" + URL.
const CCR_TERMS_URL = 'https://costrict.ai/docs/en/claude-code-on-the-web'

// /review is registered as a bundled skill via extract-to-disk mechanism,
// discovered by the standard skill scanner. Here we provide a prompt-based
// command that routes to the Skill tool for non-skill contexts (e.g. MCP).
const review: Command = {
  type: 'prompt',
  name: 'review',
  description: 'Review code for defects, security vulnerabilities, memory issues, and logic errors',
  progressMessage: 'reviewing code',
  contentLength: 0,
  source: 'builtin',
  async getPromptForCommand(args, _context): Promise<ContentBlockParam[]> {
    return [{ type: 'text', text: CommandLocale.get('review').replace('$ARGUMENTS', args) }]
  },
}

// /ultrareview is the ONLY entry point to the remote bughunter path —
// /review stays purely local. local-jsx type renders the overage permission
// dialog when free reviews are exhausted.
const ultrareview: Command = {
  type: 'local-jsx',
  name: 'ultrareview',
  description: `~10–20 min · Finds and verifies bugs in your branch. Runs in CoStrict on the web. See ${CCR_TERMS_URL}`,
  isEnabled: () => isUltrareviewEnabled(),
  load: () => import('./review/ultrareviewCommand.js'),
}

export default review
export { ultrareview }
