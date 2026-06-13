import type { WorkflowMeta } from '../types.js'

export class ScriptError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScriptError'
  }
}

/** 引擎注入脚本的钩子函数形状。 */
export type WorkflowHooks = {
  agent: (prompt: string, opts?: Record<string, unknown>) => Promise<unknown>
  parallel: <T>(thunks: Array<() => Promise<T>>) => Promise<Array<T | null>>
  pipeline: <T, R>(
    items: readonly T[],
    ...stages: Array<
      (prev: unknown, item: T, index: number) => Promise<unknown>
    >
  ) => Promise<Array<R | null>>
  phase: (title: string) => void
  log: (message: string) => void
  workflow: (
    nameOrRef: string | { scriptPath: string },
    args?: unknown,
  ) => Promise<unknown>
}

const META_RE = /export\s+const\s+meta\s*=\s*/

/**
 * 提取 `export const meta = { ... }` 纯字面量。返回 meta 对象与剥离后的 body。
 * 字面量用无参 Function 求值——任何标识符引用都会抛 ReferenceError → 报「非纯字面量」。
 */
export function extractMeta(source: string): {
  meta: WorkflowMeta | null
  body: string
} {
  const match = META_RE.exec(source)
  if (!match) return { meta: null, body: source }

  let i = match.index + match[0].length
  while (i < source.length && /\s/.test(source[i]!)) i++
  if (source[i] !== '{') {
    throw new ScriptError('meta 必须是对象字面量 `{ ... }`')
  }

  // 大括号匹配（处理字符串/转义/嵌套）
  let depth = 0
  const start = i
  let inStr: string | null = null
  for (; i < source.length; i++) {
    const ch = source[i]!
    if (inStr) {
      if (ch === '\\') {
        i++
        continue
      }
      if (ch === inStr) inStr = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        i++
        break
      }
    }
  }
  if (depth !== 0) throw new ScriptError('meta 字面量大括号未闭合')

  const literal = source.slice(start, i)
  let metaObj: unknown
  try {
    // 无参 Function：纯字面量可求值；引用任何标识符 → ReferenceError
    metaObj = new Function(`return (${literal})`)()
  } catch (e) {
    throw new ScriptError(
      `meta 必须是纯字面量（无变量/函数调用/插值）：${(e as Error).message}`,
    )
  }
  const meta = validateMeta(metaObj)

  // 剥离 meta 语句（含尾随分号与多余空行）
  const body = (source.slice(0, match.index) + source.slice(i)).replace(
    /[ \t]*;[ \t]*\n/,
    '\n',
  )
  return { meta, body }
}

function validateMeta(v: unknown): WorkflowMeta {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new ScriptError('meta 必须是对象')
  }
  const o = v as Record<string, unknown>
  if (typeof o.name !== 'string' || typeof o.description !== 'string') {
    throw new ScriptError('meta 必须含字符串 name 与 description')
  }
  return o as unknown as WorkflowMeta
}

// ---- 非确定性沙箱 shim ----
class NonDeterministicError extends Error {
  constructor(fn: string) {
    super(
      `${fn} 在 workflow 脚本中不可用（会破坏 resume 的确定性）。请通过 args 传入时间戳/随机种子。`,
    )
    this.name = 'NonDeterministicError'
  }
}

function sandboxDate(): DateConstructor {
  const fn = function (...args: unknown[]): Date {
    if (args.length === 0)
      throw new NonDeterministicError('Date.now()/new Date()')
    return new (Date as unknown as DateConstructor)(
      ...(args as [string | number | Date]),
    )
  } as unknown as DateConstructor
  fn.now = () => {
    throw new NonDeterministicError('Date.now()')
  }
  fn.parse = Date.parse
  fn.UTC = Date.UTC
  return fn
}

function sandboxMath(): Math {
  return new Proxy(Math, {
    get(target, prop, receiver) {
      if (prop === 'random') {
        return () => {
          throw new NonDeterministicError('Math.random()')
        }
      }
      return Reflect.get(target, prop, receiver)
    },
  }) as Math
}

const AsyncFunction = Object.getPrototypeOf(async function () {})
  .constructor as {
  new (...args: string[]): (...args: unknown[]) => Promise<unknown>
}

export type ParsedScript = {
  meta: WorkflowMeta | null
  execute: (
    hooks: WorkflowHooks,
    args: unknown,
    budget: unknown,
  ) => Promise<unknown>
}

/** 校验 + 包装脚本为可执行 async 函数（Date/Math 被 shim 覆盖）。 */
/**
 * 检测脚本 body 的常见违例（import / 多余 export），给出带指引的精准错误。
 * 否则会落到 AsyncFunction 的泛化「语法错误」，模型/用户难定位根因
 * （脚本是非 ESM 函数体、钩子已注入、引擎不转译 TS）。
 */
function assertScriptBody(body: string): void {
  if (/^\s*import\b/m.test(body)) {
    throw new ScriptError(
      'workflow 脚本是 new AsyncFunction 的函数体（非 ESM 模块），不支持 import。' +
        'agent / parallel / pipeline / phase / log / workflow / args / budget 已作为形参注入，直接使用。',
    )
  }
  // 动态 import(...) 调用：沙箱仅保 resume 确定性不保安全，但应阻止明显的逃逸尝试。
  // 不锚定行首以捕获 `await import(...)`、`return import(...)` 等位置；要求 `import` 后紧跟 `(` 才拦截，
  // 避免误伤字符串字面量里出现 "import" 词（如 agent('please import this module')）。
  if (/\bimport\s*\(/m.test(body)) {
    throw new ScriptError(
      'workflow 脚本中禁止动态 import(...)：会绕过 Date/Math 沙箱，破坏 resume 确定性。' +
        '沙箱不保安全（与 LLM 同级信任），但禁止显式逃逸。需要外部依赖时通过 args 注入。',
    )
  }
  if (/^\s*export\b/m.test(body)) {
    throw new ScriptError(
      'workflow 脚本只允许一处 export const meta = {...}（已被引擎提取）。' +
        '请删除其余 export / export default；用顶层 return 返回结果。',
    )
  }
}

export function parseScript(source: string): ParsedScript {
  const { meta, body } = extractMeta(source)
  assertScriptBody(body)
  let fn: (...args: unknown[]) => Promise<unknown>
  try {
    fn = new AsyncFunction(
      'agent',
      'parallel',
      'pipeline',
      'phase',
      'log',
      'workflow',
      'args',
      'budget',
      'Date',
      'Math',
      body,
    )
  } catch (e) {
    throw new ScriptError(`脚本语法错误：${(e as Error).message}`)
  }
  const sandboxedDate = sandboxDate()
  const sandboxedMath = sandboxMath()
  return {
    meta,
    async execute(hooks, args, budget) {
      return fn(
        hooks.agent,
        hooks.parallel,
        hooks.pipeline,
        hooks.phase,
        hooks.log,
        hooks.workflow,
        args,
        budget,
        sandboxedDate,
        sandboxedMath,
      )
    },
  }
}
