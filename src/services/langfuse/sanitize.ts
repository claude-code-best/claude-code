import { homedir } from 'os'

const MAX_OUTPUT_LENGTH = 500
const REDACTED_FILE_TOOLS = new Set([
  'FileReadTool',
  'FileWriteTool',
  'FileEditTool',
])
const REDACTED_SHELL_TOOLS = new Set(['BashTool', 'PowerShellTool'])
// Vault-class tools and tools that intentionally surface user secrets must
// have their tool_result redacted in Langfuse traces. PR-2 ships VaultHttpFetch;
// LocalVaultFetch is reserved for a future PR. Adding both here proactively
// keeps Langfuse export safe even before the tools land.
const SENSITIVE_OUTPUT_TOOLS = new Set([
  'ConfigTool',
  'MCPTool',
  'VaultHttpFetch',
  'LocalVaultFetch',
])

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function homePathPatterns(): string[] {
  const homes = new Set<string>()
  for (const value of [process.env.HOME, process.env.USERPROFILE, homedir()]) {
    if (value) {
      homes.add(value)
      homes.add(value.replace(/\\/g, '/'))
    }
  }

  return [
    ...Array.from(homes, escapeRegExp),
    '/Users/[^/\\\\]+',
    '[A-Za-z]:[/\\\\]Users[/\\\\][^/\\\\]+',
  ]
}

const HOME_DIR_PATTERN = new RegExp(`(?:${homePathPatterns().join('|')})`, 'g')

const SENSITIVE_KEY_PATTERN =
  /(?:api_?key|token|secret|password|credential|auth_header)/i

export function sanitizeGlobal(data: unknown): unknown {
  if (typeof data === 'string') {
    return data.replace(HOME_DIR_PATTERN, '~')
  }
  if (typeof data === 'object' && data !== null) {
    return sanitizeObject(data as Record<string, unknown>)
  }
  return data
}

function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      result[key] = '[REDACTED]'
    } else if (typeof value === 'string') {
      result[key] = value.replace(HOME_DIR_PATTERN, '~')
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitizeObject(value as Record<string, unknown>)
    } else {
      result[key] = value
    }
  }
  return result
}

export function sanitizeToolInput(_toolName: string, input: unknown): unknown {
  if (typeof input !== 'object' || input === null) return input
  const obj = { ...(input as Record<string, unknown>) }

  for (const key of Object.keys(obj)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      obj[key] = '[REDACTED]'
    }
  }

  for (const key of ['file_path', 'path', 'directory'] as const) {
    if (key in obj && typeof obj[key] === 'string') {
      obj[key] = (obj[key] as string).replace(HOME_DIR_PATTERN, '~')
    }
  }
  return obj
}

export function sanitizeToolOutput(toolName: string, output: string): string {
  if (REDACTED_FILE_TOOLS.has(toolName)) {
    return `[file content redacted, ${output.length} chars]`
  }
  if (REDACTED_SHELL_TOOLS.has(toolName)) {
    if (output.length > MAX_OUTPUT_LENGTH) {
      return output.slice(0, MAX_OUTPUT_LENGTH) + '\n[truncated]'
    }
  }
  if (SENSITIVE_OUTPUT_TOOLS.has(toolName)) {
    return `[${toolName} output redacted, ${output.length} chars]`
  }
  return output
}
