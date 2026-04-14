// MCP string utility functions — pure, no dependencies
// Extracted from src/services/mcp/mcpStringUtils.ts and normalization.ts

// Claude.ai server names are prefixed with this string
const CLAUDEAI_SERVER_PREFIX = 'claude.ai '

/**
 * Normalize server names to be compatible with the API pattern ^[a-zA-Z0-9_-]{1,64}$
 * Replaces any invalid characters (including dots and spaces) with underscores.
 */
export function normalizeNameForMCP(name: string): string {
  let normalized = name.replace(/[^a-zA-Z0-9_-]/g, '_')
  if (name.startsWith(CLAUDEAI_SERVER_PREFIX)) {
    normalized = normalized.replace(/_+/g, '_').replace(/^_|_$/g, '')
  }
  return normalized
}

/**
 * Generates the MCP tool/command name prefix for a given server
 */
export function getMcpPrefix(serverName: string): string {
  return `mcp__${normalizeNameForMCP(serverName)}__`
}

/**
 * Builds a fully qualified MCP tool name from server and tool names.
 * Inverse of mcpInfoFromString().
 */
export function buildMcpToolName(serverName: string, toolName: string): string {
  return `${getMcpPrefix(serverName)}${normalizeNameForMCP(toolName)}`
}

/**
 * Extracts MCP server information from a tool name string.
 * @param toolString Expected format: "mcp__serverName__toolName"
 */
export function mcpInfoFromString(toolString: string): {
  serverName: string
  toolName: string | undefined
} | null {
  const parts = toolString.split('__')
  const [mcpPart, serverName, ...toolNameParts] = parts
  if (mcpPart !== 'mcp' || !serverName) {
    return null
  }
  const toolName =
    toolNameParts.length > 0 ? toolNameParts.join('__') : undefined
  return { serverName, toolName }
}

/**
 * Returns the name to use for permission rule matching.
 */
export function getToolNameForPermissionCheck(tool: {
  name: string
  mcpInfo?: { serverName: string; toolName: string }
}): string {
  return tool.mcpInfo
    ? buildMcpToolName(tool.mcpInfo.serverName, tool.mcpInfo.toolName)
    : tool.name
}

/**
 * Extracts the display name from an MCP tool/command name
 */
export function getMcpDisplayName(
  fullName: string,
  serverName: string,
): string {
  const prefix = `mcp__${normalizeNameForMCP(serverName)}__`
  return fullName.replace(prefix, '')
}

/**
 * Extracts just the tool/command display name from a userFacingName
 */
export function extractMcpToolDisplayName(userFacingName: string): string {
  let withoutSuffix = userFacingName.replace(/\s*\(MCP\)\s*$/, '')
  withoutSuffix = withoutSuffix.trim()
  const dashIndex = withoutSuffix.indexOf(' - ')
  if (dashIndex !== -1) {
    return withoutSuffix.substring(dashIndex + 3).trim()
  }
  return withoutSuffix
}
