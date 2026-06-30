import { expect, test } from 'bun:test'
import { workflowInputSchema } from '../tool/schema.js'

test('empty object passes (all fields optional)', () => {
  expect(workflowInputSchema.safeParse({}).success).toBe(true)
})

test('all known fields can be filled', () => {
  const r = workflowInputSchema.safeParse({
    script: 'return 1',
    name: 'release',
    scriptPath: '/abs/x.ts',
    args: { n: 1 },
    resumeFromRunId: 'run-1',
    description: 'do thing',
    title: 'T',
    maxConcurrency: 3,
  })
  expect(r.success).toBe(true)
})

test('args accepts any JSON value (object/array/string/number/boolean/null)', () => {
  for (const args of [{ a: 1 }, [1, 2], 's', 42, true, null]) {
    expect(workflowInputSchema.safeParse({ args }).success).toBe(true)
  }
})

test('type errors rejected (script/name/scriptPath not strings)', () => {
  expect(workflowInputSchema.safeParse({ script: 123 }).success).toBe(false)
  expect(workflowInputSchema.safeParse({ name: 42 }).success).toBe(false)
  expect(workflowInputSchema.safeParse({ scriptPath: {} }).success).toBe(false)
})

test('resumeFromRunId/description/title must be strings', () => {
  expect(workflowInputSchema.safeParse({ resumeFromRunId: 1 }).success).toBe(
    false,
  )
  expect(workflowInputSchema.safeParse({ description: 1 }).success).toBe(false)
  expect(workflowInputSchema.safeParse({ title: 1 }).success).toBe(false)
})

test('unknown fields are stripped (zod default non-strict, safeParse succeeds)', () => {
  const r = workflowInputSchema.safeParse({ script: 'x', extra: 1 })
  expect(r.success).toBe(true)
})

test('maxConcurrency: integers 1-16 valid; 0/17/decimal/non-number rejected', () => {
  for (const n of [1, 3, 5, 16]) {
    expect(workflowInputSchema.safeParse({ maxConcurrency: n }).success).toBe(
      true,
    )
  }
  for (const bad of [0, -1, 17, 100, 1.5, '3', NaN]) {
    expect(workflowInputSchema.safeParse({ maxConcurrency: bad }).success).toBe(
      false,
    )
  }
})

test('maxConcurrency optional (safeParse succeeds when omitted)', () => {
  expect(workflowInputSchema.safeParse({ script: 'x' }).success).toBe(true)
})
