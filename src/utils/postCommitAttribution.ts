import { join } from 'path'
import {
  readFile,
  writeFile,
  mkdir,
  unlink,
  access,
  constants,
} from 'fs/promises'
import { logForDebugging } from './debug.js'
import { logError } from './log.js'

/**
 * Marker comment embedded in the hook script so we can identify our hook
 * vs. user-installed hooks during uninstall / detection.
 */
const HOOK_MARKER = '# claude-code-attribution-hook'

/**
 * Generate the prepare-commit-msg hook script content.
 * The hook appends Claude Code attribution trailers to the commit message
 * when a pending attribution file exists.
 */
function generateHookScript(): string {
  // The hook checks for a pending attribution file written by the CLI
  // before each commit. If found, it appends the trailers and removes
  // the pending file.
  return `#!/bin/sh
${HOOK_MARKER}
# Auto-installed by Claude Code for commit attribution tracking.
# Remove this file or run claude with COMMIT_ATTRIBUTION disabled to stop.

PENDING="$HOME/.claude/attribution-pending.txt"
if [ -f "$PENDING" ]; then
  # Append a blank line separator then the trailers
  echo "" >> "$1"
  cat "$PENDING" >> "$1"
  rm -f "$PENDING"
fi
`
}

/**
 * Resolve the hooks directory for a given project root.
 * Checks core.hooksPath first, then falls back to .git/hooks.
 */
async function resolveHooksDir(
  projectRoot: string,
  overrideHooksDir?: string,
): Promise<string> {
  if (overrideHooksDir) {
    return overrideHooksDir
  }
  // Default git hooks directory
  return join(projectRoot, '.git', 'hooks')
}

/**
 * Install the prepare-commit-msg hook for attribution tracking.
 *
 * Called from:
 * - `worktree.ts` when creating a new worktree (to propagate the hook)
 *
 * The hook appends attribution trailers to commit messages when the CLI
 * writes a pending attribution file before a commit.
 *
 * @param projectRoot     Path to the git working tree
 * @param overrideHooksDir  Optional override for the hooks directory
 */
export async function installPrepareCommitMsgHook(
  projectRoot: string,
  overrideHooksDir?: string,
): Promise<void> {
  try {
    const hooksDir = await resolveHooksDir(projectRoot, overrideHooksDir)
    const hookPath = join(hooksDir, 'prepare-commit-msg')

    // Check if a hook already exists
    try {
      const existing = await readFile(hookPath, 'utf-8')

      // If it's our hook, update it
      if (existing.includes(HOOK_MARKER)) {
        await writeFile(hookPath, generateHookScript(), { mode: 0o755 })
        logForDebugging(
          `Attribution: updated prepare-commit-msg hook at ${hookPath}`,
        )
        return
      }

      // Another hook exists — don't overwrite
      logForDebugging(
        `Attribution: skipping hook install — existing prepare-commit-msg at ${hookPath}`,
      )
      return
    } catch {
      // No existing hook — install ours
    }

    await mkdir(hooksDir, { recursive: true })
    await writeFile(hookPath, generateHookScript(), { mode: 0o755 })
    logForDebugging(
      `Attribution: installed prepare-commit-msg hook at ${hookPath}`,
    )
  } catch (error) {
    logError(error as Error)
  }
}
