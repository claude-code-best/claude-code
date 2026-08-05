import { Ajv, type ValidateFunction } from 'ajv'

const cache = new WeakMap<object, ValidateFunction>()

function getValidator(schema: object): ValidateFunction {
  const cached = cache.get(schema)
  if (cached) return cached

  const ajv = new Ajv({ allErrors: true, strict: false })
  const validate = ajv.compile(schema) as ValidateFunction & {
    $async?: boolean
  }
  if (validate.$async) {
    throw new Error('Async JSON schemas are not supported')
  }
  cache.set(schema, validate)
  return validate
}

/** Compile a JSON Schema up front so configuration errors fail before journal replay or backend execution. */
export function assertValidJsonSchema(schema: object): void {
  getValidator(schema)
}

/**
 * Validate agent output against a JSON Schema (Ajv, compilation result cached by schema object).
 * The engine performs secondary validation on the schema result returned by the adapter, and uses it for tests.
 */
export function validateAgainstSchema(
  value: unknown,
  schema: object,
): { valid: boolean; errors: string[] } {
  const validate = getValidator(schema)
  const valid = validate(value) as boolean
  return {
    valid,
    errors: valid
      ? []
      : (validate.errors ?? []).map(e => {
          const message = e.message ?? 'validation error'
          return e.instancePath ? `${e.instancePath} ${message}` : message
        }),
  }
}
