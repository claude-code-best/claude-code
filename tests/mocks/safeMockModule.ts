import { mock } from 'bun:test'
import { fileURLToPath } from 'node:url'

type ModuleSnapshot = Record<string, unknown>

const originalSnapshots = new Map<string, ModuleSnapshot>()

export function createSafeMockModule(baseUrl: string) {
  const restores: (() => void)[] = []

  function resolveFromBase(modulePath: string) {
    return fileURLToPath(new URL(modulePath, baseUrl))
  }

  function getOriginalSnapshot(tsModulePath: string, jsModulePath: string) {
    const existing = originalSnapshots.get(jsModulePath)
    if (existing) {
      return existing
    }

    const snapshot = { ...(require(tsModulePath) as ModuleSnapshot) }
    originalSnapshots.set(jsModulePath, snapshot)
    return snapshot
  }

  function safeMockModule(
    tsPath: string,
    overrides: Record<string, unknown>,
  ) {
    const tsModulePath = resolveFromBase(tsPath)
    const jsModulePath = resolveFromBase(tsPath.replace(/\.ts$/, '.js'))
    const snapshot = getOriginalSnapshot(tsModulePath, jsModulePath)
    mock.module(jsModulePath, () => ({ ...snapshot, ...overrides }))
    restores.push(() => mock.module(jsModulePath, () => snapshot))
  }

  function restoreSafeMocks() {
    for (let i = restores.length - 1; i >= 0; i--) {
      restores[i]()
    }
    restores.length = 0
  }

  return { safeMockModule, restoreSafeMocks }
}
