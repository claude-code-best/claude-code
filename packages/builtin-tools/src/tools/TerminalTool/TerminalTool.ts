import { z } from 'zod/v4'
import type { ToolResultBlockParam } from 'src/Tool.js'
import { buildTool } from 'src/Tool.js'
import {
  getTerminalManager,
  TERMINAL_KEYS,
  type TerminalKey,
  type WaitSpec,
} from 'src/services/terminal/manager.js'
import { lazySchema } from 'src/utils/lazySchema.js'
import {
  TERMINAL_DESCRIPTION,
  TERMINAL_PROMPT,
  TERMINAL_TOOL_NAME,
} from './prompt.js'
import { formatWaitResult, truncateOutput } from './shared.js'

const waitSchema = () =>
  z
    .strictObject({
      until: z
        .enum(['prompt', 'silence', 'pattern', 'exit'])
        .describe('Completion condition to wait for'),
      pattern: z
        .string()
        .optional()
        .describe(
          "Regex for until:'pattern'. Include failure words too, e.g. 'BUILD (SUCCESS|FAILED)|error'",
        ),
      silence_ms: z
        .number()
        .optional()
        .describe("Silence threshold for until:'silence' (default 2000)"),
      timeout_s: z
        .number()
        .describe('Hard cap in seconds. Timing out is not an error.'),
    })
    .describe('Wait condition (for action:run)')

const inputSchema = lazySchema(() =>
  z.strictObject({
    action: z
      .enum(['open', 'run', 'input', 'keys', 'signal', 'resize', 'close'])
      .describe('Terminal operation to perform'),
    term: z
      .string()
      .describe(
        "Terminal name, e.g. 'main', 'deploy-web01', 'monitor-nginx'. Created by action:'open'.",
      ),
    cwd: z.string().optional().describe('open: working directory'),
    purpose: z
      .string()
      .optional()
      .describe('open: short human-readable purpose, shown to the user'),
    cols: z.number().optional().describe('open/resize: columns'),
    rows: z.number().optional().describe('open/resize: rows'),
    command: z.string().optional().describe('run: full command line'),
    wait: waitSchema()
      .optional()
      .describe("run: wait spec; default {until:'prompt', timeout_s:60}"),
    text: z.string().optional().describe('input: raw text to type'),
    enter: z
      .boolean()
      .optional()
      .describe('input: press Enter after text (default true)'),
    keys: z
      .array(
        z.enum(Object.keys(TERMINAL_KEYS) as [TerminalKey, ...TerminalKey[]]),
      )
      .optional()
      .describe('keys: special key sequence to send'),
    signal: z
      .enum(['SIGINT', 'SIGTERM', 'SIGKILL'])
      .optional()
      .describe(
        'signal: signal for the foreground process (escalate in order)',
      ),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>
type TerminalInput = z.infer<InputSchema>

type TerminalOutput = { result: string }

function toWaitSpec(wait: NonNullable<TerminalInput['wait']>): WaitSpec {
  return {
    until: wait.until,
    pattern: wait.pattern,
    silenceMs: wait.silence_ms,
    timeoutS: wait.timeout_s,
  }
}

/** input/keys 后短暂收集回显，模型立即看到界面反应 */
async function echoAfterWrite(term: string): Promise<string> {
  const manager = getTerminalManager()
  const result = await manager.wait(
    term,
    { until: 'silence', silenceMs: 300, timeoutS: 2 },
    'terminal-tool',
  )
  const echo = truncateOutput(result.output)
  return echo.trim().length > 0 ? `----\n${echo}` : '(no immediate output)'
}

export const TerminalTool = buildTool({
  name: TERMINAL_TOOL_NAME,
  searchHint: 'pty shell persistent interactive ssh session tmux long running',
  maxResultSizeChars: 40_000,
  strict: true,

  get inputSchema(): InputSchema {
    return inputSchema()
  },

  async description() {
    return TERMINAL_DESCRIPTION
  },
  async prompt() {
    return TERMINAL_PROMPT
  },

  isConcurrencySafe() {
    return false
  },
  isReadOnly() {
    return false
  },
  interruptBehavior() {
    return 'cancel'
  },

  userFacingName() {
    return TERMINAL_TOOL_NAME
  },

  renderToolUseMessage(input: Partial<TerminalInput>) {
    const term = input.term ?? '?'
    switch (input.action) {
      case 'open':
        return `Terminal open: ${term}${input.purpose ? ` (${input.purpose})` : ''}`
      case 'run': {
        const cmd = input.command ?? ''
        return `[${term}] $ ${cmd.length > 80 ? `${cmd.slice(0, 77)}...` : cmd}`
      }
      case 'input':
        return `[${term}] type: ${(input.text ?? '').slice(0, 60)}`
      case 'keys':
        return `[${term}] keys: ${(input.keys ?? []).join(' ')}`
      case 'signal':
        return `[${term}] ${input.signal ?? 'SIGINT'}`
      case 'resize':
        return `[${term}] resize ${input.cols}x${input.rows}`
      case 'close':
        return `Terminal close: ${term}`
      default:
        return `Terminal ${input.action ?? '?'}: ${term}`
    }
  },

  mapToolResultToToolResultBlockParam(
    content: TerminalOutput,
    toolUseID: string,
  ): ToolResultBlockParam {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: content.result,
    }
  },

  async call(input: TerminalInput) {
    const manager = getTerminalManager()

    switch (input.action) {
      case 'open': {
        const { info, alreadyExisted } = manager.open({
          name: input.term,
          cwd: input.cwd,
          purpose: input.purpose,
          cols: input.cols,
          rows: input.rows,
        })
        return {
          data: {
            result: alreadyExisted
              ? `Terminal "${info.name}" already exists (cwd: ${info.cwd}). Reusing it.`
              : `Opened terminal "${info.name}" (cwd: ${info.cwd}, ${info.cols}x${info.rows}).`,
          },
        }
      }

      case 'run': {
        if (!input.command) {
          return { data: { result: 'Error: action "run" requires "command".' } }
        }
        if (!manager.has(input.term)) {
          manager.open({ name: input.term, cwd: input.cwd })
        }
        const spec: WaitSpec = input.wait
          ? toWaitSpec(input.wait)
          : { until: 'prompt', timeoutS: 60 }
        const result = await manager.run(
          input.term,
          input.command,
          spec,
          'terminal-tool',
        )
        return { data: { result: formatWaitResult(input.term, result) } }
      }

      case 'input': {
        const text = input.text ?? ''
        manager.write(input.term, text + (input.enter === false ? '' : '\r'))
        return {
          data: {
            result: `[${input.term}] typed.\n${await echoAfterWrite(input.term)}`,
          },
        }
      }

      case 'keys': {
        if (!input.keys || input.keys.length === 0) {
          return { data: { result: 'Error: action "keys" requires "keys".' } }
        }
        manager.sendKeys(input.term, input.keys)
        return {
          data: {
            result: `[${input.term}] sent: ${input.keys.join(' ')}.\n${await echoAfterWrite(input.term)}`,
          },
        }
      }

      case 'signal': {
        const sig = input.signal ?? 'SIGINT'
        manager.signal(input.term, sig)
        const after = await manager.wait(
          input.term,
          { until: 'silence', silenceMs: 500, timeoutS: 3 },
          'terminal-tool',
        )
        return {
          data: {
            result:
              `[${input.term}] sent ${sig}.\n` +
              (after.output.trim()
                ? `----\n${truncateOutput(after.output)}`
                : '(no output after signal)'),
          },
        }
      }

      case 'resize': {
        if (!input.cols || !input.rows) {
          return {
            data: { result: 'Error: action "resize" requires cols and rows.' },
          }
        }
        manager.resize(input.term, input.cols, input.rows)
        return {
          data: {
            result: `[${input.term}] resized to ${input.cols}x${input.rows}.`,
          },
        }
      }

      case 'close': {
        manager.close(input.term)
        return { data: { result: `Terminal "${input.term}" closed.` } }
      }

      default:
        return { data: { result: `Error: unknown action.` } }
    }
  },
})
