import type { Command, LocalCommandCall } from '../../types/command.js'
import { getWorkflowCommands } from '../../tools/WorkflowTool/createWorkflowCommand.js'
import { getCwd } from '../../utils/cwd.js'

const call: LocalCommandCall = async (_args, _context) => {
  const commands = await getWorkflowCommands(getCwd())
  if (commands.length === 0) {
    return {
      type: 'text',
      value: 'No workflows found. Add workflow files to .claude/workflows/ (YAML or Markdown).',
    }
  }
  const list = commands.map((cmd) => `  /${cmd.name} - ${cmd.description}`).join('\n')
  return { type: 'text', value: `Available workflows:\n${list}` }
}

const workflows = {
  type: 'local',
  name: 'workflows',
  description: 'List available workflow scripts',
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default workflows
