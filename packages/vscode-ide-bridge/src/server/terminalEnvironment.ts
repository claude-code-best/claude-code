type EnvironmentVariableCollectionLike = {
  replace(name: string, value: string): void
  delete(name: string): void
}

const CLAUDE_CODE_SSE_PORT = 'CLAUDE_CODE_SSE_PORT'

export function setClaudeCodeIdePort(
  collection: EnvironmentVariableCollectionLike | undefined,
  port: number,
): void {
  collection?.replace(CLAUDE_CODE_SSE_PORT, String(port))
}

export function clearClaudeCodeIdePort(
  collection: EnvironmentVariableCollectionLike | undefined,
): void {
  collection?.delete(CLAUDE_CODE_SSE_PORT)
}
