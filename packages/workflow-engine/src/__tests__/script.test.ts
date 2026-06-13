import { expect, test } from 'bun:test'
import {
  ScriptError,
  extractMeta,
  parseScript,
  type WorkflowHooks,
} from '../engine/script.js'

const stubHooks: WorkflowHooks = {
  agent: async () => 'agent-result',
  parallel: async thunks =>
    Promise.all(
      thunks.map(async t => {
        try {
          return await t()
        } catch {
          return null
        }
      }),
    ),
  pipeline: async () => [],
  phase: () => {},
  log: () => {},
  workflow: async () => null,
}

test('extractMeta 提取纯字面量并剥离语句', () => {
  const src = `export const meta = { name: 'x', description: 'y' }\nreturn 1`
  const { meta, body } = extractMeta(src)
  expect(meta?.name).toBe('x')
  expect(meta?.description).toBe('y')
  expect(body).not.toContain('export const meta')
  expect(body).toContain('return 1')
})

test('extractMeta 无 meta 返回 null 且 body 不变', () => {
  const src = `return 42`
  const { meta, body } = extractMeta(src)
  expect(meta).toBeNull()
  expect(body).toBe(src)
})

test('extractMeta 拒绝非纯字面量（引用变量）', () => {
  const src = `const x = 1\nexport const meta = { name: 'x', description: y }\nreturn 1`
  expect(() => extractMeta(src)).toThrow(ScriptError)
})

test('parseScript 执行 body 顶层 return', async () => {
  const { execute } = parseScript(`return args.n + 1`)
  const out = await execute(stubHooks, { n: 41 }, { total: null })
  expect(out).toBe(42)
})

test('脚本中 Date.now() 抛非确定性错误', async () => {
  const { execute } = parseScript(`return Date.now()`)
  await expect(execute(stubHooks, {}, { total: null })).rejects.toThrow(
    /Date\.now/,
  )
})

test('脚本中 Math.random() 抛非确定性错误', async () => {
  const { execute } = parseScript(`return Math.random()`)
  await expect(execute(stubHooks, {}, { total: null })).rejects.toThrow(
    /Math\.random/,
  )
})

test('无参 new Date() 抛，有参 new Date() 可用', async () => {
  const bad = parseScript(`return new Date()`)
  await expect(bad.execute(stubHooks, {}, { total: null })).rejects.toThrow(
    /new Date/,
  )
  const good = parseScript(
    `return new Date('2020-06-12T00:00:00Z').getUTCFullYear()`,
  )
  await expect(good.execute(stubHooks, {}, { total: null })).resolves.toBe(2020)
})

// ---- meta 校验错误分支与嵌套 ----

test('extractMeta meta 为数组 → ScriptError', () => {
  expect(() => extractMeta('export const meta = [1, 2]\nreturn 1')).toThrow(
    ScriptError,
  )
})

test('extractMeta meta 缺 name → ScriptError', () => {
  expect(() =>
    extractMeta('export const meta = { description: "d" }\nreturn 1'),
  ).toThrow(ScriptError)
})

test('extractMeta meta 缺 description → ScriptError', () => {
  expect(() =>
    extractMeta('export const meta = { name: "n" }\nreturn 1'),
  ).toThrow(ScriptError)
})

test('extractMeta meta 大括号未闭合 → ScriptError', () => {
  expect(() =>
    extractMeta('export const meta = { name: "n", description: "d"\nreturn 1'),
  ).toThrow(ScriptError)
})

test('extractMeta 支持嵌套对象（phases 数组）', () => {
  const src = `export const meta = { name: 'x', description: 'y', phases: [{ title: 'A' }, { title: 'B' }] }\nreturn 1`
  const { meta } = extractMeta(src)
  expect(meta?.name).toBe('x')
  expect(meta?.phases).toHaveLength(2)
  expect(meta?.phases?.[0]?.title).toBe('A')
  expect(meta?.phases?.[1]?.title).toBe('B')
})

test('parseScript 语法错 → ScriptError', () => {
  expect(() => parseScript('return ((')).toThrow(ScriptError)
})

test('parseScript 检测 import → 带指引的 ScriptError（不落泛化语法错）', () => {
  expect(() =>
    parseScript(
      `import { foo } from 'bar'\nexport const meta = { name: 'n', description: 'd' }\nreturn foo()`,
    ),
  ).toThrow(ScriptError)
  expect(() =>
    parseScript(
      `import { foo } from 'bar'\nexport const meta = { name: 'n', description: 'd' }\nreturn foo()`,
    ),
  ).toThrow(/不支持 import/)
})

test('parseScript 检测 meta 之外的多余 export → 带指引的 ScriptError', () => {
  expect(() =>
    parseScript(
      `export const meta = { name: 'n', description: 'd' }\nexport const X = 1\nreturn X`,
    ),
  ).toThrow(ScriptError)
  expect(() =>
    parseScript(
      `export const meta = { name: 'n', description: 'd' }\nexport const X = 1\nreturn X`,
    ),
  ).toThrow(/只允许一处 export const meta/)
})

test('parseScript 正常纯 JS 脚本（无 import/无多余 export）不被误拦', () => {
  const { execute } = parseScript(
    `export const meta = { name: 'n', description: 'd' }\nconst r = await agent('hi')\nreturn r`,
  )
  expect(typeof execute).toBe('function')
})

test('parseScript 检测动态 import(...) → 带指引的 ScriptError（沙箱防逃逸）', () => {
  expect(() =>
    parseScript(
      `const cp = await import('node:child_process')\nreturn cp.execSync('id').toString()`,
    ),
  ).toThrow(ScriptError)
  expect(() =>
    parseScript(`const cp = await import('node:child_process')\nreturn cp`),
  ).toThrow(/import/)
})

test('parseScript 检测行中含 import 字符串字面量时不误拦（如 prompt 里出现 "import"）', () => {
  // 字符串里的 import 不应被静态 regex 拦——允许 prompt 包含 "import" 词
  const { execute } = parseScript(
    `export const meta = { name: 'n', description: 'd' }\nconst r = await agent('please import this module')\nreturn r`,
  )
  expect(typeof execute).toBe('function')
})
