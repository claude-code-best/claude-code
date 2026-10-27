/**
 * Shared rendering of tool parameter schemas for prompts.
 *
 * Deferred tools never reach the model's tool list, so the only channel for
 * their parameter schema is prompt text (SearchExtraTools tool_result and the
 * inter-turn tool_discovery attachment). Both paths must render schemas the
 * same way: dialect keyword stripped, bounded size, wrapped as inert data.
 */

/** Upper bound on a single rendered schema. Guards against context bloat from
 * a pathological — and untrusted — server-supplied schema. */
export const MAX_RENDERED_SCHEMA_CHARS = 4000

/**
 * Drop the `$schema` dialect keyword. It is noise for the model and unsupported
 * by several providers; the Ajv validation path strips it for the same reason.
 */
export function normalizeSchemaForModel(schema: object): object {
  if (!('$schema' in schema)) return schema
  const clone = { ...(schema as Record<string, unknown>) }
  delete clone.$schema
  return clone
}

/**
 * Serialize a schema for prompt text. Never throws (an untrusted schema may
 * contain a cycle) and never emits an unbounded blob.
 */
export function renderSchemaForModel(
  schema: unknown,
  maxChars: number = MAX_RENDERED_SCHEMA_CHARS,
): string {
  let json: string | undefined
  try {
    json = JSON.stringify(schema, null, 2)
  } catch {
    return '[schema unavailable]'
  }
  if (json === undefined) return '[schema unavailable]'
  if (json.length > maxChars) {
    // Do not point at a re-fetch path: SearchExtraTools returns this same
    // truncated text, so the remainder is not retrievable that way.
    return `${json.slice(0, maxChars)}\n... [schema truncated at ${maxChars} of ${json.length} chars — the declared property names are listed above; do not invent fields that are not shown]`
  }
  return json
}

/**
 * Keys the caller sent that the schema does not declare.
 *
 * JSON Schema permits undeclared properties by default, so a schema without
 * `required` — or one whose properties are all optional — accepts a renamed
 * key and lets the wrong name through to the MCP server. Callers use this to
 * reject that case explicitly.
 *
 * Returns [] when the schema declares no properties (nothing to compare
 * against) or explicitly permits extras.
 */
export function findUndeclaredKeys(
  schema: object,
  params: Record<string, unknown> | undefined,
): string[] {
  const properties = (schema as { properties?: unknown }).properties
  if (
    !properties ||
    typeof properties !== 'object' ||
    Object.keys(properties).length === 0
  ) {
    return []
  }
  if (
    (schema as { additionalProperties?: unknown }).additionalProperties === true
  ) {
    return []
  }
  const declared = new Set(Object.keys(properties))
  return Object.keys(params ?? {}).filter(key => !declared.has(key))
}
