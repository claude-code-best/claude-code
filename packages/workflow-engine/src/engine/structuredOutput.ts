import { Ajv, type ValidateFunction } from 'ajv'

const cache = new WeakMap<object, ValidateFunction>()

/**
 * 用 JSON Schema 校验 agent 输出（Ajv，编译结果按 schema 对象缓存）。
 * 引擎对 adapter 返回的 schema 结果做二次校验，并用于测试。
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
