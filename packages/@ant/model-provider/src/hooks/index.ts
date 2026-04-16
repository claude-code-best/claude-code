import type { ModelProviderHooks } from './types.js'

let registeredHooks: ModelProviderHooks | null = null

/**
 * Register hooks from the main project.
 * Call this during application initialization.
 */
export function registerHooks(hooks: ModelProviderHooks): void {
  registeredHooks = hooks
}

/**
 * Get registered hooks.
 * Throws if hooks not registered (fail-fast).
 */
export function getHooks(): ModelProviderHooks {
  if (!registeredHooks) {
    throw new Error(
      'ModelProvider hooks not registered. ' +
        'Call registerHooks() during app initialization.',
    )
  }
  return registeredHooks
}

export type { ModelProviderHooks }
