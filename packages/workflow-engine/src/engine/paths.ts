import { resolve, sep } from 'node:path'

/**
 * 判断 target 解析后是否位于 base 之内（含等于 base）。
 * 相对 target 会相对 base 解析（不依赖 process.cwd）。
 * 用 `sep` 边界避免前缀假阳（如 `/foo` 不是 `/foobar` 的父目录）。
 */
export function containsPath(base: string, target: string): boolean {
  const resolvedBase = resolve(base)
  const resolvedTarget = resolve(resolvedBase, target)
  if (resolvedTarget === resolvedBase) return true
  return resolvedTarget.startsWith(resolvedBase + sep)
}

/**
 * 校验命名 workflow 的 name 是否为合法标识符（拒绝路径遍历）。
 * 拒绝：含路径分隔符、null 字节、`.` / `..`。
 * 返回清洗后的 name，或 null 表示非法。
 */
export function sanitizeWorkflowName(name: string): string | null {
  if (typeof name !== 'string' || name.length === 0) return null
  if (name.includes('/') || name.includes('\\')) return null
  if (name.includes('\0')) return null
  if (name === '.' || name === '..') return null
  return name
}
