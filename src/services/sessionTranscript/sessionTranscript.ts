/**
 * Session Transcript — backup conversation messages to JSONL files.
 *
 * Called from compact.ts before compaction to preserve full message history,
 * and from attachments.ts on date boundaries to flush daily transcripts.
 *
 * Transcripts are written to ~/.claude/transcripts/<date>/<sessionId>.jsonl
 */
import { join } from 'path'
import { writeFile, mkdir } from 'fs/promises'
import type { Message } from '../../types/message.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { getSessionId } from '../../bootstrap/state.js'
import { logForDebugging } from '../../utils/debug.js'
import { logError } from '../../utils/log.js'

function getTranscriptDir(date: string): string {
  return join(getClaudeConfigHomeDir(), 'transcripts', date)
}

function getDateFromTimestamp(ts: string | number | undefined): string {
  if (!ts) return new Date().toISOString().slice(0, 10)
  const d = new Date(ts)
  return isNaN(d.getTime())
    ? new Date().toISOString().slice(0, 10)
    : d.toISOString().slice(0, 10)
}

/**
 * Write a batch of messages to the session transcript file.
 * Messages are appended as JSONL (one JSON object per line).
 * Fire-and-forget — errors are logged but never thrown.
 */
export function writeSessionTranscriptSegment(messages: Message[]): void {
  if (messages.length === 0) return

  const sessionId = getSessionId()
  const lines = messages.map(m =>
    JSON.stringify({
      sessionId,
      timestamp:
        (m as Record<string, unknown>).timestamp ?? new Date().toISOString(),
      type: m.type,
      uuid: m.uuid,
      content: (m as Record<string, unknown>).content,
    }),
  )

  // Group by date
  const byDate = new Map<string, string[]>()
  for (let i = 0; i < messages.length; i++) {
    const ts = (messages[i] as Record<string, unknown>).timestamp as
      | string
      | undefined
    const date = getDateFromTimestamp(ts)
    const existing = byDate.get(date) ?? []
    existing.push(lines[i]!)
    byDate.set(date, existing)
  }

  // Write each date's transcript
  for (const [date, dateLines] of byDate) {
    const dir = getTranscriptDir(date)
    const filePath = join(dir, `${sessionId}.jsonl`)

    void (async () => {
      try {
        await mkdir(dir, { recursive: true })
        await writeFile(filePath, dateLines.join('\n') + '\n', { flag: 'a' })
        logForDebugging(
          `SessionTranscript: wrote ${dateLines.length} entries to ${filePath}`,
        )
      } catch (error) {
        logError(error as Error)
      }
    })()
  }
}

/**
 * Flush transcript entries on date change.
 * Called from attachments.ts daily — ensures yesterday's messages are written
 * to the correct date-bucketed file even without a compaction event.
 */
export function flushOnDateChange(
  messages: Message[],
  currentDate: string,
): void {
  // Filter messages from before today that haven't been transcribed yet
  const oldMessages = messages.filter(m => {
    const ts = (m as Record<string, unknown>).timestamp as string | undefined
    const msgDate = getDateFromTimestamp(ts)
    return msgDate < currentDate
  })

  if (oldMessages.length > 0) {
    writeSessionTranscriptSegment(oldMessages)
    logForDebugging(
      `SessionTranscript: flushed ${oldMessages.length} messages on date change to ${currentDate}`,
    )
  }
}
