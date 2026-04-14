/* eslint-disable custom-rules/no-sync-fs */
// Extracts a file from Bun's $bunfs virtual filesystem to a real temp directory
// so it can be spawned as a subprocess (child processes cannot access $bunfs).
//
// Separated from embed.js so the logic is testable without Bun-specific
// `import ... with { type: 'file' }` syntax.

import { createHash } from 'crypto'
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * If `embeddedPath` is inside Bun's $bunfs virtual filesystem, extract it to a
 * temp directory and return the real path. Otherwise return the path unchanged.
 *
 * Uses a content hash for the directory name so that:
 * - Same binary version reuses the same extracted file (no accumulation)
 * - Different versions get separate directories (no collision)
 * - Concurrent instances are safe (atomic write via temp file + rename)
 *
 * @param {string} embeddedPath — path returned by `import ... with { type: 'file' }`
 * @returns {string} — a real filesystem path that can be spawned as a subprocess
 */
export function extractFromBunfs(embeddedPath) {
  if (!embeddedPath.includes('$bunfs')) {
    return embeddedPath
  }

  try {
    const content = readFileSync(embeddedPath)
    const hash = createHash('sha256').update(content).digest('hex').slice(0, 16)
    const tmpDir = join(tmpdir(), `claude-agent-sdk-${hash}`)
    const tmpPath = join(tmpDir, 'cli.js')
    mkdirSync(tmpDir, { recursive: true })
    // Write to a temp file and atomically rename to avoid truncation races —
    // concurrent readers always see either the old complete file or the new one.
    const tmpFile = join(tmpDir, `cli.js.tmp.${process.pid}`)
    writeFileSync(tmpFile, content)
    chmodSync(tmpFile, 0o755)
    renameSync(tmpFile, tmpPath)
    return tmpPath
  } catch (err) {
    // biome-ignore lint/suspicious/noConsole: intentional user-facing warning in standalone SDK helper
    console.warn(
      `[claude-agent-sdk] Failed to extract CLI from $bunfs: ${err.message}. ` +
        `Child processes cannot access $bunfs paths — the CLI will likely fail to start.`,
    )
    return embeddedPath
  }
}
