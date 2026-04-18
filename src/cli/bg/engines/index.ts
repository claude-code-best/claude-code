export type {
  BgEngine,
  BgStartOptions,
  BgStartResult,
  SessionEntry,
} from '../engine.js'

export async function selectEngine(): Promise<import('../engine.js').BgEngine> {
  if (process.platform === 'win32') {
    const { DetachedEngine } = await import('./detached.js')
    return new DetachedEngine()
  }

  const { TmuxEngine } = await import('./tmux.js')
  const tmux = new TmuxEngine()
  if (await tmux.available()) {
    return tmux
  }

  const { DetachedEngine } = await import('./detached.js')
  return new DetachedEngine()
}
