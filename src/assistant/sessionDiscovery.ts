import { logForDebugging } from '../utils/debug.js'

/**
 * Minimal session type for assistant discovery.
 * Only `id` is consumed by main.tsx (L4757); other fields are for chooser display.
 * ID format is `session_*` (compat prefix) — viewer endpoints use /v1/sessions/*.
 */
export type AssistantSession = {
  id: string
  title: string
  status: string
  created_at: string
}

/**
 * Discover assistant sessions on Anthropic CCR.
 *
 * Reuses the existing fetchCodeSessionsFromSessionsAPI() which calls
 * GET /v1/sessions with proper OAuth + anthropic-beta headers.
 *
 * Throws on failure — main.tsx L4720-4725 catch displays the error.
 * Does NOT return [] on error (that would silently redirect to install wizard).
 */
export async function discoverAssistantSessions(): Promise<AssistantSession[]> {
  const { fetchCodeSessionsFromSessionsAPI } = await import(
    '../utils/teleport/api.js'
  )

  let allSessions
  try {
    allSessions = await fetchCodeSessionsFromSessionsAPI()
  } catch (err) {
    logForDebugging(
      `[assistant:discovery] fetchCodeSessionsFromSessionsAPI failed: ${err}`,
    )
    throw err
  }

  // Filter to active/working sessions only — completed/archived are not attachable
  return allSessions
    .filter(
      s =>
        s.status === 'idle' || s.status === 'working' || s.status === 'waiting',
    )
    .map(s => ({
      id: s.id,
      title: s.title || 'Untitled',
      status: s.status,
      created_at: s.created_at ?? '',
    }))
}
