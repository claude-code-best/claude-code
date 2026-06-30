// Pure path-normalisation helper used by toolInfo / toolResults / forwarding.
//
// POSIX semantics are used so that emitted paths are platform-independent:
// ACP v1 spec (tool-calls.mdx:304-306) requires ToolCallLocation.path /
// Diff.path to be absolute, and the wire format is POSIX-style regardless of
// the host OS. Using the platform-specific `node:path` here would prepend the
// Windows drive letter (e.g. "D:\...") to POSIX-style inputs like
// "/Users/test/project" — silently corrupting paths emitted to ACP clients.
import { isAbsolute, resolve } from 'node:path/posix'

/**
 * Normalises an emitted file path against the session cwd so that
 * ToolCallLocation.path / Diff.path values are always absolute, as required
 * by the ACP v1 spec (tool-calls.mdx:304-306; all file paths MUST be absolute).
 * If no cwd is available, the original value is returned unchanged.
 */
export function toAbsolutePath(
  filePath: string | undefined,
  cwd?: string,
): string | undefined {
  if (!filePath) return undefined
  if (!cwd) return filePath
  return isAbsolute(filePath) ? filePath : resolve(cwd, filePath)
}
