import { resolve, sep } from 'node:path'

/**
 * Determine whether target, after resolution, is within base (including equal to base).
 * Relative targets are resolved against base (does not depend on process.cwd).
 * Uses the `sep` boundary to avoid false prefix positives (e.g. `/foo` is not the parent of `/foobar`).
 */
export function containsPath(base: string, target: string): boolean {
  const resolvedBase = resolve(base)
  const resolvedTarget = resolve(resolvedBase, target)
  if (resolvedTarget === resolvedBase) return true
  return resolvedTarget.startsWith(resolvedBase + sep)
}

/**
 * Validate whether the named workflow name is a legal identifier (reject path traversal).
 * Rejects: path separators, null bytes, `.` / `..`.
 * Returns the sanitized name, or null for illegal.
 */
export function sanitizeWorkflowName(name: string): string | null {
  if (typeof name !== 'string' || name.length === 0) return null
  if (name.includes('/') || name.includes('\\')) return null
  if (name.includes('\0')) return null
  if (name === '.' || name === '..') return null
  return name
}
