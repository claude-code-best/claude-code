import { z } from 'zod/v4'
import type { ToolResultBlockParam } from 'src/Tool.js'
import { buildTool } from 'src/Tool.js'
import {
  getTerminalManager,
  type WaitSpec,
} from 'src/services/terminal/manager.js'
import { lazySchema } from 'src/utils/lazySchema.js'
import {
  TERMINAL_READ_DESCRIPTION,
  TERMINAL_READ_PROMPT,
  TERMINAL_READ_TOOL_NAME,
} from './prompt.js'
import { formatWaitResult, truncateOutput } from './shared.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    action: z
      .enum(['read', 'wait', 'list'])
      .describe(
        'read=get output, wait=block until condition, list=all terminals',
      ),
    term: z
      .string()
      .optional()
      .describe('Terminal name (required for read/wait)'),
    mode: z
      .enum(['new', 'tail', 'full'])
      .optional()
      .describe(
        'read: new=incremental since your last read (default), tail=last N lines, full=entire scrollback',
      ),
    lines: z.number().optional().describe('read tail: line count (default 50)'),
    wait: z
      .strictObject({
        until: z.enum(['prompt', 'silence', 'pattern', 'exit']),
        pattern: z.string().optional(),
        silence_ms: z.number().optional(),
        timeout_s: z.number(),
      })
      .optional()
      .describe('wait: condition spec'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>
type ReadInput = z.infer<InputSchema>

type ReadOutput = { result: string }

export const TerminalReadTool = buildTool({
  name: TERMINAL_READ_TOOL_NAME,
  searchHint: 'terminal output read wait monitor watch poll tail log',
  maxResultSizeChars: 40_000,
  strict: true,

  get inputSchema(): InputSchema {
    return inputSchema()
  },

  async description() {
    return TERMINAL_READ_DESCRIPTION
  },
  async prompt() {
    return TERMINAL_READ_PROMPT
  },

  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },
  interruptBehavior() {
    return 'cancel'
  },

  userFacingName() {
    return TERMINAL_READ_TOOL_NAME
  },

  renderToolUseMessage(input: Partial<ReadInput>) {
    switch (input.action) {
      case 'list':
        return 'Terminal list'
      case 'wait':
        return `[${input.term ?? '?'}] wait ${input.wait?.until ?? ''}${
          input.wait?.pattern ? ` /${input.wait.pattern}/` : ''
        } (${input.wait?.timeout_s ?? '?'}s)`
      default:
        return `[${input.term ?? '?'}] read ${input.mode ?? 'new'}`
    }
  },

  mapToolResultToToolResultBlockParam(
    content: ReadOutput,
    toolUseID: string,
  ): ToolResultBlockParam {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: content.result,
    }
  },

  async call(input: ReadInput) {
    const manager = getTerminalManager()

    if (input.action === 'list') {
      const terminals = manager.list()
      if (terminals.length === 0) {
        return {
          data: {
            result:
              'No terminals open. Use Terminal action:"open" to create one.',
          },
        }
      }
      const lines = terminals.map(t => {
        const status = t.alive
          ? t.fgCommand
            ? `running: ${t.fgCommand.slice(0, 60)}`
            : 'idle'
          : `exited (${t.exitCode ?? '?'})`
        const age = Math.round((Date.now() - t.lastActivityAt) / 1000)
        return [
          `• ${t.name} — ${status}`,
          `  purpose: ${t.purpose ?? '(none)'} · cwd: ${t.cwd} · ${t.cols}x${t.rows} · last activity ${age}s ago`,
          t.preview ? `  ${t.preview.split('\n').join('\n  ')}` : null,
        ]
          .filter(Boolean)
          .join('\n')
      })
      return { data: { result: lines.join('\n') } }
    }

    if (!input.term) {
      return {
        data: { result: `Error: action "${input.action}" requires "term".` },
      }
    }

    if (input.action === 'wait') {
      if (!input.wait) {
        return {
          data: { result: 'Error: action "wait" requires "wait" spec.' },
        }
      }
      const spec: WaitSpec = {
        until: input.wait.until,
        pattern: input.wait.pattern,
        silenceMs: input.wait.silence_ms,
        timeoutS: input.wait.timeout_s,
      }
      const result = await manager.wait(input.term, spec, 'terminal-tool')
      return { data: { result: formatWaitResult(input.term, result) } }
    }

    // read
    const mode = input.mode ?? 'new'
    let output: string
    if (mode === 'full') {
      output = manager.readFull(input.term)
    } else if (mode === 'tail') {
      output = manager.readTail(input.term, input.lines ?? 50)
    } else {
      output = manager.readNew(input.term, 'terminal-tool')
    }
    const info = manager.info(input.term)
    const header = `[${input.term}] ${mode}${info.alive ? '' : ` (terminal exited ${info.exitCode ?? ''})`}`
    const body = truncateOutput(output)
    return {
      data: {
        result:
          body.trim().length > 0
            ? `${header}\n----\n${body}`
            : `${header}\n(no new output)`,
      },
    }
  },
})
