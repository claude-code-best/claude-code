import { feature } from 'bun:bundle'
import { z } from 'zod/v4'
import type { ToolResultBlockParam } from 'src/Tool.js'
import { buildTool } from 'src/Tool.js'
import { lazySchema } from 'src/utils/lazySchema.js'
import { SLEEP_TOOL_NAME, DESCRIPTION, SLEEP_TOOL_PROMPT } from './prompt.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    duration_seconds: z
      .number()
      .describe(
        'How long to sleep in seconds. Can be interrupted by the user at any time.',
      ),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>
type SleepInput = z.infer<InputSchema>

type SleepOutput = { slept_seconds: number; interrupted: boolean }

export const SleepTool = buildTool({
  name: SLEEP_TOOL_NAME,
  searchHint: 'wait pause sleep rest idle duration timer',
  maxResultSizeChars: 1_000,
  strict: true,

  get inputSchema(): InputSchema {
    return inputSchema()
  },

  async description() {
    return DESCRIPTION
  },
  async prompt() {
    return SLEEP_TOOL_PROMPT
  },

  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },

  userFacingName() {
    return SLEEP_TOOL_NAME
  },

  renderToolUseMessage(input: Partial<SleepInput>) {
    const secs = input.duration_seconds ?? '?'
    return `Sleep: ${secs}s`
  },

  mapToolResultToToolResultBlockParam(
    content: SleepOutput,
    toolUseID: string,
  ): ToolResultBlockParam {
    const msg = content.interrupted
      ? `Sleep interrupted after ${content.slept_seconds}s`
      : `Slept for ${content.slept_seconds}s`
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: msg,
    }
  },

  async call(input: SleepInput, context) {
    // Refuse to sleep when proactive mode is off — prevents the model from
    // re-issuing Sleep after an interruption caused by /proactive disable.
    if (feature('PROACTIVE') || feature('KAIROS')) {
      const mod =
        require('src/proactive/index.js') as typeof import('src/proactive/index.js')
      if (!mod.isProactiveActive()) {
        return {
          data: {
            slept_seconds: 0,
            interrupted: true,
          },
        }
      }
    }

    const { duration_seconds } = input
    const startTime = Date.now()

    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, duration_seconds * 1000)

        // Abort via user interrupt
        context.abortController.signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer)
            clearInterval(proactiveCheck)
            reject(new Error('interrupted'))
          },
          { once: true },
        )

        // Poll proactive state — if deactivated mid-sleep, interrupt early
        // so the user doesn't have to wait for the full duration.
        const proactiveCheck =
          feature('PROACTIVE') || feature('KAIROS')
            ? setInterval(() => {
                const mod =
                  require('src/proactive/index.js') as typeof import('src/proactive/index.js')
                if (!mod.isProactiveActive()) {
                  clearTimeout(timer)
                  clearInterval(proactiveCheck)
                  reject(new Error('interrupted'))
                }
              }, 500)
            : (null as unknown as ReturnType<typeof setInterval>)
      })
      return {
        data: {
          slept_seconds: duration_seconds,
          interrupted: false,
        },
      }
    } catch {
      const elapsed = Math.round((Date.now() - startTime) / 1000)
      return {
        data: {
          slept_seconds: elapsed,
          interrupted: true,
        },
      }
    }
  },
})
