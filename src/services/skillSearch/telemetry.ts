/**
 * Skill Search telemetry — log remote skill loading events.
 */
import { logForDebugging } from '../../utils/debug.js'

export function logRemoteSkillLoaded(data: {
  slug: string
  cacheHit: boolean
  latencyMs: number
  urlScheme: string
  error?: string
  fileCount?: number
  totalBytes?: number
  fetchMethod?: string
}): void {
  logForDebugging(
    `[skill-search] remote skill loaded: slug=${data.slug} cache=${data.cacheHit} latency=${data.latencyMs}ms scheme=${data.urlScheme}${data.error ? ` error=${data.error}` : ''}`,
  )
}
