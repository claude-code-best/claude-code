/**
 * Type-to-filter logic for the skills picker.
 *
 * Invariant: empty / whitespace-only query always returns all skills unchanged.
 * Matching is case-insensitive; each whitespace-separated word in the query
 * must appear in either the skill name or description.
 */

export type SkillItem = {
  name: string
  description: string
}

/**
 * Filter `skills` by `query`. Returns a new array; never mutates input.
 *
 * - Empty/whitespace query → returns all skills.
 * - Each word in the query must appear (case-insensitive) in the skill name
 *   OR description (AND-semantics per word, OR across name/description).
 */
export function filterSkills<T extends SkillItem>(
  skills: readonly T[],
  query: string,
): T[] {
  const trimmed = query.trim()
  if (trimmed === '') {
    return skills.slice()
  }

  const words = trimmed.toLowerCase().split(/\s+/)

  return skills.filter(skill => {
    const haystack = `${skill.name} ${skill.description}`.toLowerCase()
    return words.every(word => haystack.includes(word))
  })
}
