import { Ajv, type ValidateFunction } from 'ajv'

const cache = new WeakMap<object, ValidateFunction>()

/**
 * Validate agent output against a JSON Schema (Ajv, compilation result cached by schema object).
 * The engine performs secondary validation on the schema result returned by the adapter, and uses it for tests.
 */
export function validateAgainstSchema(
  value: unknown,
  schema: object,
): { valid: boolean; errors: string[] } {
  let validate = cache.get(schema)
  if (!validate) {
    const ajv = new Ajv({ allErrors: true, strict: false })
    validate = ajv.compile(schema) as ValidateFunction
    cache.set(schema, validate)
  }
  const valid = validate(value) as boolean
  return {
    valid,
    errors: valid
      ? []
      : (validate.errors ?? []).map(e => e.message ?? 'validation error'),
  }
}
