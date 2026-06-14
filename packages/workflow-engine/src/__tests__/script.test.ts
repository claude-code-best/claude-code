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

test('extractMeta extracts plain literals and strips the statement', () => {
  const src = `export const meta = { name: 'x', description: 'y' }\nreturn 1`
  const { meta, body } = extractMeta(src)
  expect(meta?.name).toBe('x')
  expect(meta?.description).toBe('y')
  expect(body).not.toContain('export const meta')
  expect(body).toContain('return 1')
})

test('extractMeta returns null when no meta and body unchanged', () => {
  const src = `return 42`
  const { meta, body } = extractMeta(src)
  expect(meta).toBeNull()
  expect(body).toBe(src)
})

test('extractMeta rejects non-plain literals (variable references)', () => {
  const src = `const x = 1\nexport const meta = { name: 'x', description: y }\nreturn 1`
  expect(() => extractMeta(src)).toThrow(ScriptError)
})

test('parseScript executes top-level return of body', async () => {
  const { execute } = parseScript(`return args.n + 1`)
  const out = await execute(stubHooks, { n: 41 }, { total: null })
  expect(out).toBe(42)
})

test('Date.now() in script throws non-determinism error', async () => {
  const { execute } = parseScript(`return Date.now()`)
  await expect(execute(stubHooks, {}, { total: null })).rejects.toThrow(
    /Date\.now/,
  )
})

test('Math.random() in script throws non-determinism error', async () => {
  const { execute } = parseScript(`return Math.random()`)
  await expect(execute(stubHooks, {}, { total: null })).rejects.toThrow(
    /Math\.random/,
  )
})

test('no-arg new Date() throws, but new Date(arg) is allowed', async () => {
  const bad = parseScript(`return new Date()`)
  await expect(bad.execute(stubHooks, {}, { total: null })).rejects.toThrow(
    /new Date/,
  )
  const good = parseScript(
    `return new Date('2020-06-12T00:00:00Z').getUTCFullYear()`,
  )
  await expect(good.execute(stubHooks, {}, { total: null })).resolves.toBe(2020)
})

// ---- meta validation error branches and nesting ----

test('extractMeta meta is array → ScriptError', () => {
  expect(() => extractMeta('export const meta = [1, 2]\nreturn 1')).toThrow(
    ScriptError,
  )
})

test('extractMeta meta missing name → ScriptError', () => {
  expect(() =>
    extractMeta('export const meta = { description: "d" }\nreturn 1'),
  ).toThrow(ScriptError)
})

test('extractMeta meta missing description → ScriptError', () => {
  expect(() =>
    extractMeta('export const meta = { name: "n" }\nreturn 1'),
  ).toThrow(ScriptError)
})

test('extractMeta meta unclosed braces → ScriptError', () => {
  expect(() =>
    extractMeta('export const meta = { name: "n", description: "d"\nreturn 1'),
  ).toThrow(ScriptError)
})

test('extractMeta supports nested objects (phases array)', () => {
  const src = `export const meta = { name: 'x', description: 'y', phases: [{ title: 'A' }, { title: 'B' }] }\nreturn 1`
  const { meta } = extractMeta(src)
  expect(meta?.name).toBe('x')
  expect(meta?.phases).toHaveLength(2)
  expect(meta?.phases?.[0]?.title).toBe('A')
  expect(meta?.phases?.[1]?.title).toBe('B')
})

test('parseScript syntax error → ScriptError', () => {
  expect(() => parseScript('return ((')).toThrow(ScriptError)
})

test('parseScript detects import → guided ScriptError (not a generic syntax error)', () => {
  expect(() =>
    parseScript(
      `import { foo } from 'bar'\nexport const meta = { name: 'n', description: 'd' }\nreturn foo()`,
    ),
  ).toThrow(ScriptError)
  expect(() =>
    parseScript(
      `import { foo } from 'bar'\nexport const meta = { name: 'n', description: 'd' }\nreturn foo()`,
    ),
  ).toThrow(/import is not supported/)
})

test('parseScript detects extra export beyond meta → guided ScriptError', () => {
  expect(() =>
    parseScript(
      `export const meta = { name: 'n', description: 'd' }\nexport const X = 1\nreturn X`,
    ),
  ).toThrow(ScriptError)
  expect(() =>
    parseScript(
      `export const meta = { name: 'n', description: 'd' }\nexport const X = 1\nreturn X`,
    ),
  ).toThrow(/allow only one export const meta/)
})

test('parseScript does not misfire on normal plain JS scripts (no import / no extra export)', () => {
  const { execute } = parseScript(
    `export const meta = { name: 'n', description: 'd' }\nconst r = await agent('hi')\nreturn r`,
  )
  expect(typeof execute).toBe('function')
})

test('parseScript detects dynamic import(...) → guided ScriptError (sandbox anti-escape)', () => {
  expect(() =>
    parseScript(
      `const cp = await import('node:child_process')\nreturn cp.execSync('id').toString()`,
    ),
  ).toThrow(ScriptError)
  expect(() =>
    parseScript(`const cp = await import('node:child_process')\nreturn cp`),
  ).toThrow(/import/)
})

test('parseScript does not misfire when a line contains the import string literal (e.g. prompt contains "import")', () => {
  // import inside a string should not be caught by the static regex — prompt may contain the word "import"
  const { execute } = parseScript(
    `export const meta = { name: 'n', description: 'd' }\nconst r = await agent('please import this module')\nreturn r`,
  )
  expect(typeof execute).toBe('function')
})
