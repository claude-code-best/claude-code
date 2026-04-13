import { z } from 'zod/v4'
import type { ToolResultBlockParam } from 'src/Tool.js'
import { buildTool } from 'src/Tool.js'
import { truncate } from 'src/utils/format.js'
import { WORKFLOW_TOOL_NAME } from './constants.js'

const inputSchema = z.object({
  workflow: z.string().describe('Name of the workflow to execute'),
  args: z.string().optional().describe('Arguments to pass to the workflow'),
})
type Input = typeof inputSchema
type WorkflowInput = z.infer<Input>

type WorkflowOutput = { output: string }

export const WorkflowTool = buildTool({
  name: WORKFLOW_TOOL_NAME,
  searchHint: 'execute user-defined workflow scripts',
  maxResultSizeChars: 50_000,
  strict: true,

  inputSchema,

  async description() {
    return 'Execute a user-defined workflow script from .claude/workflows/'
  },
  async prompt() {
    return `Use the Workflow tool to execute user-defined workflow scripts located in .claude/workflows/. Workflows are YAML or Markdown files that define a sequence of steps for common development tasks.

Guidelines:
- Specify the workflow name to execute (must match a file in .claude/workflows/)
- Optionally pass arguments that the workflow can use
- Workflows run in the context of the current project`
  },
  userFacingName() {
    return 'Workflow'
  },
  isReadOnly() {
    return false
  },
  isEnabled() {
    return true
  },

  renderToolUseMessage(input: Partial<WorkflowInput>) {
    const name = input.workflow ?? 'unknown'
    if (input.args) {
      return `Workflow: ${name} ${input.args}`
    }
    return `Workflow: ${name}`
  },

  mapToolResultToToolResultBlockParam(
    content: WorkflowOutput,
    toolUseID: string,
  ): ToolResultBlockParam {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: truncate(content.output, 50_000),
    }
  },

  async call(_input: WorkflowInput, _context, _progress) {
    // Workflow execution is wired by the WORKFLOW_SCRIPTS feature bootstrap.
    // Without it, this tool is not functional.
    return {
      data: {
        output:
          'Error: Workflow execution requires the WORKFLOW_SCRIPTS runtime.',
      },
    }
  },
})
