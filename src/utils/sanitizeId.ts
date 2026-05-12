/**
 * Sanitize an ID for use in error messages.
 *
 * Security invariant: full IDs (vault_id, credential_id, agent_id, etc.) must
 * not appear in error messages as they may be leaked into logs, bug reports,
 * or user-facing text. Expose only the first 8 characters.
 *
 * H3: single source of truth extracted from the 4 P2 API client files
 * (vaultsApi, agentsApi, memoryStoresApi, skillsApi).
 */
export function sanitizeId(id: string): string {
  if (id.length <= 8) return id
  return `${id.slice(0, 8)}…`
}
