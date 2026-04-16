import type { ClientFactories } from './types.js'

let registeredFactories: ClientFactories | null = null

/**
 * Register client factories from the main project.
 * Call this during application initialization.
 */
export function registerClientFactories(factories: ClientFactories): void {
  registeredFactories = factories
}

/**
 * Get registered client factories.
 * Throws if not registered (fail-fast).
 */
export function getClientFactories(): ClientFactories {
  if (!registeredFactories) {
    throw new Error(
      'Client factories not registered. ' +
        'Call registerClientFactories() during app initialization.',
    )
  }
  return registeredFactories
}

export type { ClientFactories }
