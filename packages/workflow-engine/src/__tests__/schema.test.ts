import { expect, test } from 'bun:test'
import { workflowInputSchema } from '../tool/schema.js'

test('空对象通过（所有字段 optional）', () => {
  expect(workflowInputSchema.safeParse({}).success).toBe(true)
})

test('全部已知字段可填', () => {
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

test('args 接受任意 JSON 值（对象/数组/字符串/数字/布尔/null）', () => {
  for (const args of [{ a: 1 }, [1, 2], 's', 42, true, null]) {
    expect(workflowInputSchema.safeParse({ args }).success).toBe(true)
  }
})

test('类型错误被拒（script/name/scriptPath 非字符串）', () => {
  expect(workflowInputSchema.safeParse({ script: 123 }).success).toBe(false)
  expect(workflowInputSchema.safeParse({ name: 42 }).success).toBe(false)
  expect(workflowInputSchema.safeParse({ scriptPath: {} }).success).toBe(false)
})

test('resumeFromRunId/description/title 必须为字符串', () => {
  expect(workflowInputSchema.safeParse({ resumeFromRunId: 1 }).success).toBe(
    false,
  )
  expect(workflowInputSchema.safeParse({ description: 1 }).success).toBe(false)
  expect(workflowInputSchema.safeParse({ title: 1 }).success).toBe(false)
})

test('未知字段被 strip（zod 默认非 strict，safeParse 成功）', () => {
  const r = workflowInputSchema.safeParse({ script: 'x', extra: 1 })
  expect(r.success).toBe(true)
})

test('maxConcurrency：1–16 整数合法；0/17/小数/非数字被拒', () => {
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

test('maxConcurrency optional（省略时 safeParse 成功）', () => {
  expect(workflowInputSchema.safeParse({ script: 'x' }).success).toBe(true)
})
