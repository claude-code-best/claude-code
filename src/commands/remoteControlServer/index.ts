import { feature } from 'bun:bundle'
import { isBridgeEnabled } from '../../bridge/bridgeEnabled.js'
import type { Command } from '../../commands.js'

function isEnabled(): boolean {
  if (!feature('BRIDGE_MODE')) {
    return false
  }
  if (feature('DAEMON')) {
    return isBridgeEnabled()
  }
  // DAEMON feature disabled — still allow the command but warn at runtime
  // that headless/daemon worker mode is unavailable.
  return isBridgeEnabled()
}

const remoteControlServer = {
  type: 'local-jsx',
  name: 'remote-control-worker',
  aliases: ['remote-control-server', 'rcs'],
  description:
    'Start a persistent Remote Control Bridge Worker managed by the daemon',
  isEnabled,
  get isHidden() {
    return !isEnabled()
  },
  immediate: true,
  load: () => import('./remoteControlServer.js'),
} satisfies Command

export default remoteControlServer
