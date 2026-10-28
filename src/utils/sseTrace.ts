/**
 * Raw SSE stream event tracer for diagnosing premature `end_turn` / dropped
 * tool_use events on gateway-fronted providers.
 *
 * Background: on a gateway-fronted Anthropic endpoint, Opus extended-thinking turns
 * sometimes end with `stop_reason=end_turn` right after the model announces an
 * action ("Now I'll write the file...") WITHOUT emitting the tool_use content
 * block. We need to see, at the raw stream level, exactly which SSE events the
 * gateway forwards after a long thinking block — specifically whether a
 * `content_block_start(tool_use)` ever arrives, or whether the stream jumps
 * straight to `message_delta(stop_reason=end_turn)`.
 *
 * This tracer is fully opt-in via env and self-contained (no PII filtering,
 * because we intentionally want to capture block types / stop reasons). It is
 * NOT wired into the normal debug pipeline so it works even when the ACP child
 * process runs without `--debug`.
 *
 * Enable by setting CLAUDE_CODE_SSE_TRACE_FILE=/absolute/path/to/sse-trace.log
 * (Optionally CLAUDE_CODE_SSE_TRACE=1 alone logs to a default temp path.)
 */
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

let cachedPath: string | null | undefined

function resolveTracePath(): string | null {
  if (cachedPath !== undefined) {
    return cachedPath
  }
  const explicit = process.env.CLAUDE_CODE_SSE_TRACE_FILE?.trim()
  if (explicit) {
    cachedPath = explicit
    return cachedPath
  }
  const enabled = process.env.CLAUDE_CODE_SSE_TRACE?.trim()
  if (enabled && !['0', 'false', 'no', 'off'].includes(enabled.toLowerCase())) {
    cachedPath = join(tmpdir(), 'claude-code-sse-trace.log')
    return cachedPath
  }
  cachedPath = null
  return cachedPath
}

export function isSseTraceEnabled(): boolean {
  return resolveTracePath() !== null
}

/**
 * Append a single raw SSE trace line. No-op unless enabled via env.
 *
 * @param event   Short event tag, e.g. 'stream_event', 'stream_end'.
 * @param data    Arbitrary structured data (block types, stop_reason, elapsed).
 */
export function traceSseEvent(
  event: string,
  data: Record<string, unknown>,
): void {
  const path = resolveTracePath()
  if (!path) {
    return
  }
  const line =
    JSON.stringify({ ts: new Date().toISOString(), event, ...data }) + '\n'
  try {
    appendFileSync(path, line)
  } catch {
    try {
      mkdirSync(dirname(path), { recursive: true })
      appendFileSync(path, line)
    } catch {
      // Best-effort: never crash the stream loop on a trace failure.
    }
  }
}
