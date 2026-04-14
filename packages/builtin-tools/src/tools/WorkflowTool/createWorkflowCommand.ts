import { readdir } from 'fs/promises'
import { join, parse } from 'path'
import type { Command } from 'src/types/command.js'
import { WORKFLOW_DIR_NAME, WORKFLOW_FILE_EXTENSIONS } from './constants.js'

/**
 * Scans .claude/workflows/ directory and creates Command objects for each workflow file.
 * Each workflow file becomes a slash command (e.g. /workflow-name).
 */
export async function getWorkflowCommands(cwd: string): Promise<Command[]> {
  const workflowDir = join(cwd, WORKFLOW_DIR_NAME)
  let files: string[]
  try {
    files = await readdir(workflowDir)
  } catch {
    return []
  }

  const workflowFiles = files.filter((f) => {
    const ext = parse(f).ext.toLowerCase()
    return WORKFLOW_FILE_EXTENSIONS.includes(ext)
  })

  return workflowFiles.map((file) => {
    const name = parse(file).name
    return {
      type: 'prompt' as const,
      name,
      description: `Run workflow: ${name}`,
      kind: 'workflow' as const,
      source: 'builtin' as const,
      progressMessage: `Running workflow ${name}...`,
      contentLength: 0,
      async getPromptForCommand(args, _context) {
        const { readFile } = await import('fs/promises')
        const content = await readFile(join(workflowDir, file), 'utf-8')
        return [{ type: 'text' as const, text: `Execute this workflow:\n\n${content}${args ? `\n\nArguments: ${args}` : ''}` }]
      },
    } satisfies Command
  })
}
