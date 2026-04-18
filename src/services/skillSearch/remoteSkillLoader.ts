/**
 * Remote Skill Loader — fetch remote skill definitions via HTTP with disk cache.
 *
 * Cache location: ~/.cache/claude-code/remote-skills/<slug>/
 */
import { join } from 'path'
import { readFile, writeFile, mkdir, stat } from 'fs/promises'
import { logForDebugging } from '../../utils/debug.js'
import { logRemoteSkillLoaded } from './telemetry.js'

const CACHE_DIR = join(
  process.env.HOME ?? process.env.USERPROFILE ?? '.',
  '.cache',
  'claude-code',
  'remote-skills',
)
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

/**
 * Load a remote skill by slug and URL. Checks disk cache first,
 * fetches via HTTP on cache miss.
 */
export async function loadRemoteSkill(
  slug: string,
  url: string,
): Promise<{
  cacheHit: boolean
  latencyMs: number
  skillPath: string
  content: string
  fileCount?: number
  totalBytes?: number
  fetchMethod?: string
}> {
  const startTime = Date.now()
  const cacheDir = join(CACHE_DIR, slug)
  const cachePath = join(cacheDir, 'SKILL.md')

  // Check disk cache
  try {
    const fileStat = await stat(cachePath)
    if (Date.now() - fileStat.mtimeMs < CACHE_TTL_MS) {
      const content = await readFile(cachePath, 'utf-8')
      const latencyMs = Date.now() - startTime
      logRemoteSkillLoaded({
        slug,
        cacheHit: true,
        latencyMs,
        urlScheme: new URL(url).protocol,
      })
      return {
        cacheHit: true,
        latencyMs,
        skillPath: cachePath,
        content,
        fileCount: 1,
        totalBytes: Buffer.byteLength(content),
        fetchMethod: 'disk-cache',
      }
    }
  } catch {
    // Cache miss — fetch from URL
  }

  // Fetch from URL
  try {
    const response = await fetch(url)
    if (!response.ok) {
      const latencyMs = Date.now() - startTime
      logRemoteSkillLoaded({
        slug,
        cacheHit: false,
        latencyMs,
        urlScheme: new URL(url).protocol,
        error: `HTTP ${response.status}`,
      })
      return {
        cacheHit: false,
        latencyMs,
        skillPath: '',
        content: '',
        fetchMethod: 'http-error',
      }
    }

    const content = await response.text()

    // Write to disk cache
    await mkdir(cacheDir, { recursive: true })
    await writeFile(cachePath, content, 'utf-8')

    const latencyMs = Date.now() - startTime
    logRemoteSkillLoaded({
      slug,
      cacheHit: false,
      latencyMs,
      urlScheme: new URL(url).protocol,
      fileCount: 1,
      totalBytes: Buffer.byteLength(content),
      fetchMethod: 'http',
    })

    return {
      cacheHit: false,
      latencyMs,
      skillPath: cachePath,
      content,
      fileCount: 1,
      totalBytes: Buffer.byteLength(content),
      fetchMethod: 'http',
    }
  } catch (error) {
    const latencyMs = Date.now() - startTime
    logRemoteSkillLoaded({
      slug,
      cacheHit: false,
      latencyMs,
      urlScheme: 'unknown',
      error: error instanceof Error ? error.message : String(error),
    })
    logForDebugging(
      `[skill-search] failed to load remote skill ${slug}: ${error}`,
    )
    return {
      cacheHit: false,
      latencyMs,
      skillPath: '',
      content: '',
      fetchMethod: 'error',
    }
  }
}
