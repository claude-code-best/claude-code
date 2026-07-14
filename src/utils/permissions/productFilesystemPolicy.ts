import { lstatSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { getProductRuntimeConfig } from '../productMode.js'

export type ProductWriteBoundaryResult =
  | { allowed: true }
  | { allowed: false; reason: string }

function canonicalizePotentialPath(path: string): string {
  const absolute = resolve(path)
  let current = absolute
  const missing: string[] = []

  while (true) {
    try {
      return join(realpathSync(current), ...missing.reverse())
    } catch {
      try {
        const entry = lstatSync(current)
        if (entry.isSymbolicLink()) {
          throw new Error(`Dangling symlink in write path: ${current}`)
        }
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('Dangling')) {
          throw error
        }
      }
      const parent = dirname(current)
      if (parent === current)
        throw new Error(`Cannot resolve write path: ${path}`)
      missing.push(current.slice(parent.length).replace(/^[/\\]+/, ''))
      current = parent
    }
  }
}

function containsPath(root: string, target: string): boolean {
  const child = relative(root, target)
  return child === '' || (!child.startsWith('..') && !isAbsolute(child))
}

export function checkProductWriteBoundary(
  requestedPath: string,
): ProductWriteBoundaryResult {
  const runtime = getProductRuntimeConfig()
  if (runtime?.product !== 'chat') return { allowed: true }

  try {
    const root = realpathSync(runtime.sessionDataDirectory)
    const target = canonicalizePotentialPath(requestedPath)
    return containsPath(root, target)
      ? { allowed: true }
      : {
          allowed: false,
          reason:
            'Chat sessions may write only inside their session data directory',
        }
  } catch (error) {
    return {
      allowed: false,
      reason:
        error instanceof Error ? error.message : 'Invalid Chat write path',
    }
  }
}
