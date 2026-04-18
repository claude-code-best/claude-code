/**
 * Remote Skill State — session-level registry for discovered remote skills.
 */

const CANONICAL_PREFIX = 'remote://'
const discoveredRemoteSkills = new Map<
  string,
  { url: string; discoveredAt: number }
>()

/**
 * Strip the canonical remote:// prefix from a skill name.
 * Returns the slug if the name has the prefix, null otherwise.
 */
export function stripCanonicalPrefix(name: string): string | null {
  if (name.startsWith(CANONICAL_PREFIX)) {
    return name.slice(CANONICAL_PREFIX.length)
  }
  return null
}

/**
 * Look up a discovered remote skill by slug.
 */
export function getDiscoveredRemoteSkill(
  slug: string,
): { url: string } | undefined {
  const entry = discoveredRemoteSkills.get(slug)
  return entry ? { url: entry.url } : undefined
}

/**
 * Register a discovered remote skill.
 */
export function addDiscoveredRemoteSkill(slug: string, url: string): void {
  discoveredRemoteSkills.set(slug, { url, discoveredAt: Date.now() })
}

/**
 * Clear all discovered remote skills.
 */
export function clearDiscoveredRemoteSkills(): void {
  discoveredRemoteSkills.clear()
}
