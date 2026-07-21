import type { WaitResult } from 'src/services/terminal/manager.js'

/** 单次返回给模型的输出上限：超限保头 2KB + 尾 6KB */
const MAX_OUTPUT_CHARS = 8 * 1024
const HEAD_CHARS = 2 * 1024
const TAIL_CHARS = 6 * 1024

export function truncateOutput(output: string): string {
  if (output.length <= MAX_OUTPUT_CHARS) return output
  const omittedLines = output
    .slice(HEAD_CHARS, output.length - TAIL_CHARS)
    .split('\n').length
  return (
    output.slice(0, HEAD_CHARS) +
    `\n[... ${omittedLines} lines omitted — use TerminalRead mode:'full' to see everything ...]\n` +
    output.slice(-TAIL_CHARS)
  )
}

export function formatWaitResult(term: string, result: WaitResult): string {
  const lines: string[] = []
  const seconds = (result.durationMs / 1000).toFixed(1)
  if (result.outcome === 'timeout') {
    lines.push(
      `[${term}] timed_out: true after ${seconds}s — condition not met` +
        (result.stillRunning === true
          ? '; foreground command still running'
          : ''),
    )
  } else {
    lines.push(
      `[${term}] done: ${result.outcome}` +
        (result.matched
          ? ` (matched: ${JSON.stringify(result.matched)})`
          : '') +
        (result.exitCode !== undefined ? ` (exit ${result.exitCode})` : '') +
        ` in ${seconds}s`,
    )
  }
  if (result.stillRunning === true && result.outcome !== 'timeout') {
    lines.push('note: foreground command appears to still be running')
  }
  const output = truncateOutput(result.output)
  lines.push(output.trim().length > 0 ? `----\n${output}` : '(no new output)')
  return lines.join('\n')
}
