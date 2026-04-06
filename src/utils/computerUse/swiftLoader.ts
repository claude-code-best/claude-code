import type { ComputerUseAPI } from '@ant/computer-use-swift'

let cached: ComputerUseAPI | undefined

/**
 * macOS-only loader for @ant/computer-use-swift.
 * Non-darwin platforms should use src/utils/computerUse/platforms/ instead.
 */
export function requireComputerUseSwift(): ComputerUseAPI {
  if (cached) return cached
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@ant/computer-use-swift')
  if (mod.ComputerUseAPI && typeof mod.ComputerUseAPI === 'function') {
    cached = new mod.ComputerUseAPI() as ComputerUseAPI
  } else {
    cached = mod as ComputerUseAPI
  }
  return cached
}

export type { ComputerUseAPI }
