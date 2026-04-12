// Unicode sanitization for MCP data
// Extracted from src/utils/sanitization.ts

/**
 * Recursively sanitizes Unicode characters in MCP server responses.
 * Removes or replaces problematic Unicode that could cause display or parsing issues.
 */
export function recursivelySanitizeUnicode<T>(data: T): T {
  if (typeof data === 'string') {
    // Remove control characters except \t, \n, \r
    // Replace null bytes and other C0 controls
    return data
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .replace(/\uFFFD/g, '') // replacement character
      .normalize('NFC') as unknown as T
  }

  if (Array.isArray(data)) {
    return data.map(item => recursivelySanitizeUnicode(item)) as unknown as T
  }

  if (data !== null && typeof data === 'object') {
    const result = {} as Record<string, unknown>
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      result[key] = recursivelySanitizeUnicode(value)
    }
    return result as T
  }

  return data
}
