import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  getOriginalCwd,
  getSessionId,
  getSessionProjectDir,
} from '../../bootstrap/state.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { sanitizePath } from '../../utils/path.js'
import type { Command, LocalCommandResult } from '../../types/command.js'

const DEFAULT_N = 5
const MAX_OUTPUT_LEN = 200

interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: unknown
}

interface ToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content: unknown
}

interface LogEntry {
  role?: string
  content?: unknown
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

function truncate(s: string, maxLen: number): string {
  return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s
}

function renderValue(v: unknown): string {
  if (typeof v === 'string') return truncate(v, MAX_OUTPUT_LEN)
  try {
    return truncate(JSON.stringify(v, null, 2), MAX_OUTPUT_LEN)
  } catch {
    return String(v).slice(0, MAX_OUTPUT_LEN)
  }
}

function extractContentBlocks(
  content: unknown,
): Array<ToolUseBlock | ToolResultBlock> {
  if (!Array.isArray(content)) return []
  const result: Array<ToolUseBlock | ToolResultBlock> = []
  for (const block of content as Array<Record<string, unknown>>) {
    if (block.type === 'tool_use' && typeof block.id === 'string') {
      result.push({
        type: 'tool_use',
        id: block.id,
        name: typeof block.name === 'string' ? block.name : 'unknown',
        input: block.input,
      })
    } else if (
      block.type === 'tool_result' &&
      typeof block.tool_use_id === 'string'
    ) {
      result.push({
        type: 'tool_result',
        tool_use_id: block.tool_use_id,
        content: block.content,
      })
    }
  }
  return result
}

function parseToolCallsFromLog(
  logPath: string,
): Array<{ name: string; input: string; output: string }> {
  const raw = readFileSync(logPath, 'utf8')
  const lines = raw.trim().split('\n').filter(Boolean)

  const toolUseMap = new Map<string, ToolUseBlock>()
  const pairs: Array<{ name: string; input: string; output: string }> = []

  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as LogEntry
      if (!entry.content) continue
      const blocks = extractContentBlocks(entry.content)
      for (const block of blocks) {
        if (block.type === 'tool_use') {
          toolUseMap.set(block.id, block)
        } else if (block.type === 'tool_result') {
          const use = toolUseMap.get(block.tool_use_id)
          if (use) {
            pairs.push({
              name: use.name,
              input: renderValue(use.input),
              output: renderValue(block.content),
            })
          }
        }
      }
    } catch {
      // skip malformed lines
    }
  }

  return pairs
}

const debugToolCall: Command = {
  type: 'local',
  name: 'debug-tool-call',
  description:
    'Show the last N tool call pairs (use/result) from the session log',
  isHidden: false,
  isEnabled: () => true,
  supportsNonInteractive: true,
  bridgeSafe: true,
  load: async () => ({
    call: async (args: string): Promise<LocalCommandResult> => {
      const n = args.trim() ? parseInt(args.trim(), 10) : DEFAULT_N
      const count = Number.isFinite(n) && n > 0 ? n : DEFAULT_N

      const logPath = getTranscriptPath()

      if (!existsSync(logPath)) {
        return {
          type: 'text',
          value: [
            '## Debug Tool Calls',
            '',
            `Log file not found: \`${logPath}\``,
            '',
            'No tool calls to show — the session log has not been created yet.',
          ].join('\n'),
        }
      }

      const pairs = parseToolCallsFromLog(logPath)
      const recent = pairs.slice(-count)

      if (recent.length === 0) {
        return {
          type: 'text',
          value: [
            '## Debug Tool Calls',
            '',
            `No tool call pairs found in session log: \`${logPath}\``,
            '',
            'Tool calls appear after the model invokes a tool and receives a result.',
          ].join('\n'),
        }
      }

      const lines: string[] = [
        `## Last ${recent.length} Tool Call${recent.length === 1 ? '' : 's'} (of ${pairs.length} total)`,
        '',
      ]

      for (let i = 0; i < recent.length; i++) {
        const pair = recent[i]
        lines.push(`### [${pairs.length - recent.length + i + 1}] ${pair.name}`)
        lines.push(`**Input:**`)
        lines.push('```')
        lines.push(pair.input)
        lines.push('```')
        lines.push(`**Output:**`)
        lines.push('```')
        lines.push(pair.output)
        lines.push('```')
        lines.push('')
      }

      return { type: 'text', value: lines.join('\n') }
    },
  }),
}

export default debugToolCall
