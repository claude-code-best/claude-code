import { join } from 'node:path'
import {
  listNamedWorkflows,
  WORKFLOW_DIR_NAME,
} from '@claude-code-best/workflow-engine'
import type { Command } from '../types/command.js'
import { getProjectRoot } from '../bootstrap/state.js'

/** 扫描 .claude/workflows/ 下 *.ts|*.js|*.mjs，每个生成一个 /<name> 命令。 */
export async function getWorkflowCommands(
  cwd: string = getProjectRoot(),
): Promise<Command[]> {
  const dir = join(cwd, WORKFLOW_DIR_NAME)
  const names = await listNamedWorkflows(dir)
  return names.map(name => ({
    type: 'prompt',
    name,
    description: `Run workflow: ${name}`,
    kind: 'workflow',
    source: 'builtin',
    progressMessage: `Running workflow ${name}...`,
    contentLength: 0,
    async getPromptForCommand(args, _context) {
      const argText =
        typeof args === 'string' && args ? `\n\nArguments: ${args}` : ''
      return [
        {
          type: 'text',
          text: `Run the "${name}" workflow now by calling the Workflow tool with name="${name}".${argText}`,
        },
      ]
    },
  }))
}
