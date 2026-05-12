import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import {
  getOriginalCwd,
  getSessionId,
  getSessionProjectDir,
} from '../../bootstrap/state.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { sanitizePath } from '../../utils/path.js'
import type { Command, LocalCommandResult } from '../../types/command.js'

/**
 * Cost rates in USD per 1M tokens, keyed by model ID prefix.
 * Rates sourced from Anthropic pricing page (2026-04).
 * Unrecognized models produce a '~$ unknown' label instead of a stale estimate.
 */
const MODEL_COST_RATES: Record<
  string,
  { input: number; output: number; cache_creation: number; cache_read: number }
> = {
  // Claude Sonnet 4.6 / claude-sonnet-4 series
  'claude-sonnet-4': {
    input: 3.0,
    output: 15.0,
    cache_creation: 3.75,
    cache_read: 0.3,
  },
  // Claude Opus 4.5 / claude-opus-4 series
  'claude-opus-4': {
    input: 15.0,
    output: 75.0,
    cache_creation: 18.75,
    cache_read: 1.5,
  },
  // Claude Haiku 4.5 / claude-haiku-4 series
  'claude-haiku-4': {
    input: 0.8,
    output: 4.0,
    cache_creation: 1.0,
    cache_read: 0.08,
  },
  // Claude 3.7 Sonnet
  'claude-3-7-sonnet': {
    input: 3.0,
    output: 15.0,
    cache_creation: 3.75,
    cache_read: 0.3,
  },
  // Claude 3.5 Sonnet
  'claude-3-5-sonnet': {
    input: 3.0,
    output: 15.0,
    cache_creation: 3.75,
    cache_read: 0.3,
  },
  // Claude 3.5 Haiku
  'claude-3-5-haiku': {
    input: 0.8,
    output: 4.0,
    cache_creation: 1.0,
    cache_read: 0.08,
  },
  // Claude 3 Opus
  'claude-3-opus': {
    input: 15.0,
    output: 75.0,
    cache_creation: 18.75,
    cache_read: 1.5,
  },
}

type CostRates = {
  input: number
  output: number
  cache_creation: number
  cache_read: number
}

function lookupCostRates(model: string | null | undefined): CostRates | null {
  if (!model) return null
  for (const [prefix, rates] of Object.entries(MODEL_COST_RATES)) {
    if (model.startsWith(prefix)) return rates
  }
  return null
}

/**
 * Sanitizes an error message before surfacing it to the user:
 * - Replaces the home directory path with "~" to avoid leaking absolute paths.
 * - Truncates to 200 characters to avoid leaking large stack traces or token fragments.
 */
function sanitizeErrorMessage(msg: string): string {
  const home = homedir()
  let sanitized = msg.replace(
    new RegExp(home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
    '~',
  )
  if (sanitized.length > 200) sanitized = sanitized.slice(0, 200) + '…'
  return sanitized
}

function getPerfReportDir(): string {
  return join(homedir(), '.claude', 'perf-reports')
}

function getTranscriptPath(): string {
  const sessionId = getSessionId()
  const projectDir = getSessionProjectDir()
  if (projectDir) return join(projectDir, `${sessionId}.jsonl`)
  return join(
    getClaudeConfigHomeDir(),
    'projects',
    sanitizePath(getOriginalCwd()),
    `${sessionId}.jsonl`,
  )
}

interface UsageTotals {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
}

interface LogEntry {
  role?: string
  type?: string
  content?: unknown
  usage?: Record<string, number>
  timestamp?: string | number
  model?: string
}

interface ToolUseBlock {
  type: 'tool_use'
  name?: string
  id?: string
}

interface ToolResultBlock {
  type: 'tool_result'
  tool_use_id?: string
}

interface ToolTiming {
  name: string
  /** Timestamp from the log entry (ms). null means no timestamp was present. */
  logTimestampMs: number | null
  durationMs?: number
}

interface AnalyzedLog {
  usage: UsageTotals
  toolCounts: Record<string, number>
  /** Durations in ms computed from log timestamps. Only present when both
   *  tool_use and tool_result entries carry a timestamp. */
  toolDurations: Record<string, number[]>
  turnCount: number
  messageCount: number
  cacheHitRate: number
  estimatedCostUsd: number | null
  /** Model detected from log (first assistant message with a model field). */
  detectedModel: string | null
  firstTimestampMs: number | null
  lastTimestampMs: number | null
  wallClockSeconds: number | null
}

function parseTimestampMs(tsRaw: string | number | undefined): number | null {
  if (tsRaw === undefined) return null
  const tsMs =
    typeof tsRaw === 'number'
      ? tsRaw
      : typeof tsRaw === 'string'
        ? Date.parse(tsRaw)
        : null
  if (tsMs === null || Number.isNaN(tsMs)) return null
  return tsMs
}

/**
 * Default maximum number of JSONL lines to read from the log file.
 * Prevents OOM when session transcripts grow beyond hundreds of MB.
 * The last MAX_LOG_LINES lines are used so recent activity is always reflected.
 */
const MAX_LOG_LINES = 20_000

function analyzeLog(logPath: string, maxLines = MAX_LOG_LINES): AnalyzedLog {
  const usage: UsageTotals = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  }
  const toolCounts: Record<string, number> = {}
  const toolDurations: Record<string, number[]> = {}
  const pendingToolUses = new Map<string, ToolTiming>()
  let turnCount = 0
  let messageCount = 0
  let firstTimestampMs: number | null = null
  let lastTimestampMs: number | null = null
  let detectedModel: string | null = null

  const allLines = readFileSync(logPath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
  // Apply line cap: use the last maxLines entries so recent turns are always included.
  const lines =
    allLines.length > maxLines ? allLines.slice(-maxLines) : allLines

  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as LogEntry
      messageCount++

      if (entry.role === 'user') turnCount++

      // Capture first observed model name from any entry
      if (entry.model && detectedModel === null) {
        detectedModel = entry.model
      }

      // Track wall-clock window from log entry timestamps
      const entryTsMs = parseTimestampMs(entry.timestamp)
      if (entryTsMs !== null) {
        if (firstTimestampMs === null) firstTimestampMs = entryTsMs
        lastTimestampMs = entryTsMs
      }

      if (entry.usage) {
        for (const key of Object.keys(usage) as Array<keyof UsageTotals>) {
          const val = entry.usage[key]
          if (typeof val === 'number') usage[key] += val
        }
      }

      if (Array.isArray(entry.content)) {
        for (const block of entry.content as Array<Record<string, unknown>>) {
          if (block.type === 'tool_use') {
            const b = block as unknown as ToolUseBlock
            const name = b.name ?? 'unknown'
            toolCounts[name] = (toolCounts[name] ?? 0) + 1
            if (b.id) {
              // Record the log-entry timestamp for this tool_use; null if absent.
              pendingToolUses.set(b.id, { name, logTimestampMs: entryTsMs })
            }
          } else if (block.type === 'tool_result') {
            const b = block as unknown as ToolResultBlock
            if (b.tool_use_id) {
              const pending = pendingToolUses.get(b.tool_use_id)
              if (pending) {
                // Only record duration when both endpoints have a real timestamp.
                if (pending.logTimestampMs !== null && entryTsMs !== null) {
                  const durationMs = entryTsMs - pending.logTimestampMs
                  toolDurations[pending.name] =
                    toolDurations[pending.name] ?? []
                  toolDurations[pending.name].push(durationMs)
                }
                pendingToolUses.delete(b.tool_use_id)
              }
            }
          }
        }
      }
    } catch {
      // skip malformed
    }
  }

  // Cache hit rate: fraction of cache-related tokens that were hits (not creation)
  const cacheTotal =
    usage.cache_creation_input_tokens + usage.cache_read_input_tokens
  const cacheHitRate =
    cacheTotal > 0 ? usage.cache_read_input_tokens / cacheTotal : 0

  // Cost estimate — only if we can look up rates for the detected model.
  const rates = lookupCostRates(detectedModel)
  const estimatedCostUsd = rates
    ? (usage.input_tokens / 1_000_000) * rates.input +
      (usage.output_tokens / 1_000_000) * rates.output +
      (usage.cache_creation_input_tokens / 1_000_000) * rates.cache_creation +
      (usage.cache_read_input_tokens / 1_000_000) * rates.cache_read
    : null

  const wallClockSeconds =
    firstTimestampMs !== null && lastTimestampMs !== null
      ? (lastTimestampMs - firstTimestampMs) / 1000
      : null

  return {
    usage,
    toolCounts,
    toolDurations,
    turnCount,
    messageCount,
    cacheHitRate,
    estimatedCostUsd,
    detectedModel,
    firstTimestampMs,
    lastTimestampMs,
    wallClockSeconds,
  }
}

function top10Tools(toolCounts: Record<string, number>): string[] {
  return Object.entries(toolCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => `  ${name.padEnd(40)} ${count}`)
}

function avgMs(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function formatReportMarkdown(
  sessionId: string,
  logPath: string,
  analyzed: AnalyzedLog,
): string {
  const {
    usage,
    toolCounts,
    toolDurations,
    turnCount,
    messageCount,
    cacheHitRate,
    estimatedCostUsd,
    detectedModel,
    wallClockSeconds,
  } = analyzed
  const m = process.memoryUsage()
  const cpu = process.cpuUsage()
  const totalTokens =
    usage.input_tokens +
    usage.output_tokens +
    usage.cache_creation_input_tokens +
    usage.cache_read_input_tokens
  const toolLines = top10Tools(toolCounts)

  const toolAvgLines = Object.entries(toolDurations)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10)
    .map(
      ([name, durs]) =>
        `  ${name.padEnd(40)} avg ${avgMs(durs).toFixed(0)} ms  (${durs.length} calls)`,
    )

  return [
    '# Claude Code Performance Snapshot',
    '',
    `- timestamp: ${new Date().toISOString()}`,
    `- session:   ${sessionId}`,
    `- pid:       ${process.pid}`,
    `- platform:  ${process.platform} ${process.arch}`,
    `- bun:       ${typeof Bun !== 'undefined' ? Bun.version : 'n/a'}`,
    `- node:      ${process.version}`,
    `- uptime:    ${process.uptime().toFixed(1)}s`,
    '',
    '## Memory',
    `- rss:           ${m.rss}`,
    `- heap used:     ${m.heapUsed}`,
    `- heap total:    ${m.heapTotal}`,
    `- external:      ${m.external}`,
    `- array buffers: ${m.arrayBuffers ?? 0}`,
    '',
    '## CPU (process.cpuUsage, microseconds)',
    `- user:   ${cpu.user}`,
    `- system: ${cpu.system}`,
    '',
    '## Session Token Usage',
    `- total_tokens:          ${totalTokens.toLocaleString()}`,
    `- input_tokens:          ${usage.input_tokens.toLocaleString()}`,
    `- output_tokens:         ${usage.output_tokens.toLocaleString()}`,
    `- cache_creation:        ${usage.cache_creation_input_tokens.toLocaleString()}`,
    `- cache_read:            ${usage.cache_read_input_tokens.toLocaleString()}`,
    `- turns (user messages): ${turnCount}`,
    `- total log entries:     ${messageCount}`,
    wallClockSeconds !== null
      ? `- wall_clock_seconds:    ${wallClockSeconds.toFixed(1)}`
      : '',
    '',
    '## Cost Estimate (approximate)',
    detectedModel
      ? `- model: ${detectedModel}`
      : '- model: (unknown — not present in log)',
    estimatedCostUsd !== null
      ? `- estimated_usd: $${estimatedCostUsd.toFixed(4)}`
      : '- estimated_usd: ~$ unknown (unrecognized model)',
    `- cache_hit_rate: ${(cacheHitRate * 100).toFixed(1)}%`,
    '',
    '## Tool Call Counts (top 10)',
    toolLines.length > 0 ? toolLines.join('\n') : '  (no tool calls)',
    '',
    '## Tool Average Execution Time (top 10 by call count)',
    toolAvgLines.length > 0
      ? toolAvgLines.join('\n')
      : '  (no timing data — tool_result/tool_use pairs not found)',
    '',
    '## Notes',
    '',
    'Add a description of what you were doing when the perf issue surfaced:',
    '',
    '- ___',
    '',
    "_(File this report in your repo's issue tracker. No network call was made._",
    '_The fork does not transmit perf reports to Anthropic.)_',
  ]
    .filter(line => line !== '')
    .join('\n')
}

function formatReportJSON(sessionId: string, analyzed: AnalyzedLog): string {
  const m = process.memoryUsage()
  const cpu = process.cpuUsage()
  const totalTokens =
    analyzed.usage.input_tokens +
    analyzed.usage.output_tokens +
    analyzed.usage.cache_creation_input_tokens +
    analyzed.usage.cache_read_input_tokens

  return JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      session: sessionId,
      pid: process.pid,
      platform: process.platform,
      arch: process.arch,
      uptime: process.uptime(),
      memory: { ...m },
      cpu: { ...cpu },
      tokens: {
        total: totalTokens,
        input: analyzed.usage.input_tokens,
        output: analyzed.usage.output_tokens,
        cache_creation: analyzed.usage.cache_creation_input_tokens,
        cache_read: analyzed.usage.cache_read_input_tokens,
      },
      turns: analyzed.turnCount,
      messages: analyzed.messageCount,
      cache_hit_rate: analyzed.cacheHitRate,
      detected_model: analyzed.detectedModel,
      estimated_cost_usd: analyzed.estimatedCostUsd,
      wall_clock_seconds: analyzed.wallClockSeconds,
      tool_counts: analyzed.toolCounts,
      tool_avg_ms: Object.fromEntries(
        Object.entries(analyzed.toolDurations).map(([k, v]) => [k, avgMs(v)]),
      ),
    },
    null,
    2,
  )
}

function formatReportCSV(analyzed: AnalyzedLog): string {
  const rows: string[] = [
    'metric,value',
    `timestamp,${new Date().toISOString()}`,
    `input_tokens,${analyzed.usage.input_tokens}`,
    `output_tokens,${analyzed.usage.output_tokens}`,
    `cache_creation_tokens,${analyzed.usage.cache_creation_input_tokens}`,
    `cache_read_tokens,${analyzed.usage.cache_read_input_tokens}`,
    `turns,${analyzed.turnCount}`,
    `cache_hit_rate,${analyzed.cacheHitRate.toFixed(4)}`,
    `estimated_cost_usd,${analyzed.estimatedCostUsd !== null ? analyzed.estimatedCostUsd.toFixed(6) : 'unknown'}`,
    `wall_clock_seconds,${analyzed.wallClockSeconds ?? ''}`,
    ...Object.entries(analyzed.toolCounts).map(
      ([name, count]) => `tool_count_${name},${count}`,
    ),
  ]
  return rows.join('\n')
}

const perfIssue: Command = {
  type: 'local',
  name: 'perf-issue',
  description:
    'Capture a performance + token-usage snapshot. Flags: --format=json|csv|md (default md)',
  isHidden: false,
  isEnabled: () => true,
  supportsNonInteractive: true,
  bridgeSafe: true,
  load: async () => ({
    call: async (args: string): Promise<LocalCommandResult> => {
      try {
        // Parse --format flag
        const formatMatch = args.match(/--format[= ](json|csv|md)/)
        const format: 'md' | 'json' | 'csv' = formatMatch
          ? (formatMatch[1] as 'md' | 'json' | 'csv')
          : 'md'

        // Parse --limit N (max JSONL lines to read; guards against OOM on large logs)
        const limitMatch = args.match(/--limit[= ](\d+)/)
        const lineLimit = limitMatch
          ? Math.max(1, parseInt(limitMatch[1], 10))
          : MAX_LOG_LINES

        const dir = getPerfReportDir()
        mkdirSync(dir, { recursive: true })
        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
        const sessionId = getSessionId()
        const ext = format === 'json' ? 'json' : format === 'csv' ? 'csv' : 'md'
        const reportPath = join(
          dir,
          `perf-${stamp}-${sessionId.slice(0, 8)}.${ext}`,
        )

        const logPath = getTranscriptPath()
        const hasLog = existsSync(logPath)

        let analyzed: AnalyzedLog | null = null
        if (hasLog) {
          try {
            analyzed = analyzeLog(logPath, lineLimit)
          } catch {
            analyzed = null
          }
        }

        // Build empty analyzed stats when log is unavailable
        const safeAnalyzed: AnalyzedLog = analyzed ?? {
          usage: {
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
          toolCounts: {},
          toolDurations: {},
          turnCount: 0,
          messageCount: 0,
          cacheHitRate: 0,
          estimatedCostUsd: null,
          detectedModel: null,
          firstTimestampMs: null,
          lastTimestampMs: null,
          wallClockSeconds: null,
        }

        let reportContent: string
        if (format === 'json') {
          reportContent = formatReportJSON(sessionId, safeAnalyzed)
        } else if (format === 'csv') {
          reportContent = formatReportCSV(safeAnalyzed)
        } else {
          reportContent = formatReportMarkdown(sessionId, logPath, safeAnalyzed)
          if (!hasLog) {
            reportContent += `\n\n## Session Log\n(log not found at \`${logPath}\`)`
          }
        }

        writeFileSync(reportPath, reportContent, 'utf8')
        return {
          type: 'text',
          value: `Perf snapshot written to:\n  \`${reportPath}\`\n\nFormat: ${format}\nEdit it to add notes, then attach to your bug report.`,
        }
      } catch (err: unknown) {
        const msg = sanitizeErrorMessage(
          err instanceof Error ? err.message : String(err),
        )
        return { type: 'text', value: `Failed to write perf report: ${msg}` }
      }
    },
  }),
}

export default perfIssue
