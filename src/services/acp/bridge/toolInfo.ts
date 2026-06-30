// toolInfoFromToolUse — large switch mapping each known tool name to ACP ToolInfo.
import type { ToolInfo } from './types.js'
import { toAbsolutePath } from './paths.js'
import { toDisplayPath } from '../utils.js'

export function toolInfoFromToolUse(
  toolUse: { name: string; id: string; input: Record<string, unknown> },
  _supportsTerminalOutput: boolean = false,
  cwd?: string,
): ToolInfo {
  const name = toolUse.name
  const input = toolUse.input

  switch (name) {
    case 'Agent':
    case 'Task': {
      const description = (input?.description as string | undefined) ?? 'Task'
      const prompt = input?.prompt as string | undefined
      return {
        title: description,
        kind: 'think',
        content: prompt
          ? [
              {
                type: 'content' as const,
                content: { type: 'text' as const, text: prompt },
              },
            ]
          : [],
      }
    }

    case 'Bash': {
      const command = (input?.command as string | undefined) ?? 'Terminal'
      const description = input?.description as string | undefined
      // Standard ACP terminal lifecycle (terminal/create → embed real terminalId →
      // terminal/release) is not wired through BashTool yet. Embedding a fake
      // terminalId here would cause compliant clients to fail terminal/output
      // lookups, so we fall back to inline text content per audit doc §5.2.
      // The _supportsTerminalOutput flag is retained for forward compatibility
      // once terminal/create is actually plumbed through.
      void _supportsTerminalOutput
      return {
        title: command,
        kind: 'execute',
        content: description
          ? [
              {
                type: 'content' as const,
                content: { type: 'text' as const, text: description },
              },
            ]
          : [],
      }
    }

    case 'Read': {
      const inputFilePath = input?.file_path as string | undefined
      const filePath = inputFilePath ?? 'File'
      const offset = input?.offset as number | undefined
      const limit = input?.limit as number | undefined
      let suffix = ''
      if (limit && limit > 0) {
        suffix = ` (${offset ?? 1} - ${(offset ?? 1) + limit - 1})`
      } else if (offset) {
        suffix = ` (from line ${offset})`
      }
      const displayPath = filePath ? toDisplayPath(filePath, cwd) : 'File'
      const absReadPath = toAbsolutePath(inputFilePath, cwd)
      return {
        title: `Read ${displayPath}${suffix}`,
        kind: 'read',
        locations: absReadPath
          ? [{ path: absReadPath, line: offset ?? 1 }]
          : [],
        content: [],
      }
    }

    case 'Write': {
      const filePath = (input?.file_path as string | undefined) ?? ''
      const content = (input?.content as string | undefined) ?? ''
      const displayPath = filePath ? toDisplayPath(filePath, cwd) : undefined
      const absWritePath = toAbsolutePath(filePath, cwd)
      return {
        title: displayPath ? `Write ${displayPath}` : 'Write',
        kind: 'edit',
        content: absWritePath
          ? [
              {
                type: 'diff' as const,
                path: absWritePath,
                oldText: null,
                newText: content,
              },
            ]
          : [
              {
                type: 'content' as const,
                content: { type: 'text' as const, text: content },
              },
            ],
        locations: absWritePath ? [{ path: absWritePath }] : [],
      }
    }

    case 'Edit': {
      const filePath = (input?.file_path as string | undefined) ?? ''
      const oldString = (input?.old_string as string | undefined) ?? ''
      const newString = (input?.new_string as string | undefined) ?? ''
      const displayPath = filePath ? toDisplayPath(filePath, cwd) : undefined
      const absEditPath = toAbsolutePath(filePath, cwd)
      return {
        title: displayPath ? `Edit ${displayPath}` : 'Edit',
        kind: 'edit',
        content: absEditPath
          ? [
              {
                type: 'diff' as const,
                path: absEditPath,
                oldText: oldString || null,
                newText: newString,
              },
            ]
          : [],
        locations: absEditPath ? [{ path: absEditPath }] : [],
      }
    }

    case 'Glob': {
      const globPath = (input?.path as string | undefined) ?? ''
      const pattern = (input?.pattern as string | undefined) ?? ''
      const absGlobPath = toAbsolutePath(globPath, cwd)
      let label = 'Find'
      if (globPath) label += ` \`${globPath}\``
      if (pattern) label += ` \`${pattern}\``
      return {
        title: label,
        kind: 'search',
        content: [],
        locations: absGlobPath ? [{ path: absGlobPath }] : [],
      }
    }

    case 'Grep': {
      const grepPattern = (input?.pattern as string | undefined) ?? ''
      const grepPath = (input?.path as string | undefined) ?? ''
      let label = 'grep'
      if (input?.['-i']) label += ' -i'
      if (input?.['-n']) label += ' -n'
      if (input?.['-A'] !== undefined) label += ` -A ${input['-A'] as number}`
      if (input?.['-B'] !== undefined) label += ` -B ${input['-B'] as number}`
      if (input?.['-C'] !== undefined) label += ` -C ${input['-C'] as number}`
      if (input?.output_mode === 'files_with_matches') label += ' -l'
      else if (input?.output_mode === 'count') label += ' -c'
      if (input?.head_limit !== undefined)
        label += ` | head -${input.head_limit as number}`
      if (input?.glob) label += ` --include="${input.glob as string}"`
      if (input?.type) label += ` --type=${input.type as string}`
      if (input?.multiline) label += ' -P'
      if (grepPattern) label += ` "${grepPattern}"`
      if (grepPath) label += ` ${grepPath}`
      return {
        title: label,
        kind: 'search',
        content: [],
      }
    }

    case 'WebFetch': {
      const url = (input?.url as string | undefined) ?? ''
      const fetchPrompt = input?.prompt as string | undefined
      return {
        title: url ? `Fetch ${url}` : 'Fetch',
        kind: 'fetch',
        content: fetchPrompt
          ? [
              {
                type: 'content' as const,
                content: { type: 'text' as const, text: fetchPrompt },
              },
            ]
          : [],
      }
    }

    case 'WebSearch': {
      const query = (input?.query as string | undefined) ?? 'Web search'
      let label = `"${query}"`
      const allowed = input?.allowed_domains as string[] | undefined
      const blocked = input?.blocked_domains as string[] | undefined
      if (allowed && allowed.length > 0)
        label += ` (allowed: ${allowed.join(', ')})`
      if (blocked && blocked.length > 0)
        label += ` (blocked: ${blocked.join(', ')})`
      return {
        title: label,
        kind: 'fetch',
        content: [],
      }
    }

    case 'TodoWrite': {
      const todos = input?.todos as Array<{ content: string }> | undefined
      return {
        title: Array.isArray(todos)
          ? `Update TODOs: ${todos.map(t => t.content).join(', ')}`
          : 'Update TODOs',
        kind: 'think',
        content: [],
      }
    }

    case 'ExitPlanMode': {
      const plan = (input as Record<string, unknown>)?.plan as
        | string
        | undefined
      return {
        title: 'Ready to code?',
        kind: 'switch_mode',
        content: plan
          ? [
              {
                type: 'content' as const,
                content: { type: 'text' as const, text: plan },
              },
            ]
          : [],
      }
    }

    default:
      return {
        title: name || 'Unknown Tool',
        kind: 'other',
        content: [],
      }
  }
}
