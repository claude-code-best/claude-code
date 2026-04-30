import { feature } from 'bun:bundle'

export function handleRemoteInterrupt(
  abortController: AbortController | null,
): void {
  if (feature('PROACTIVE') || feature('KAIROS')) {
    const { pauseProactive } =
      require('../proactive/index.js') as typeof import('../proactive/index.js')
    pauseProactive()
  }

  abortController?.abort()
}
