import {
  getBridgeAccessToken,
  getBridgeBaseUrl,
  isSelfHostedBridge,
} from '../bridge/bridgeConfig.js'

export function formatRemoteControlLocalStatus(): string {
  try {
    const selfHosted = isSelfHostedBridge()
    const token = getBridgeAccessToken()
    return [
      `Remote Control: ${selfHosted ? 'self-hosted' : 'official'}`,
      `  base_url=${getBridgeBaseUrl()}`,
      `  token=${token ? 'present' : 'missing'}`,
      '  entitlement=checked at remote-control startup',
    ].join('\n')
  } catch (error) {
    return [
      'Remote Control: unknown',
      `  reason=${error instanceof Error ? error.message : String(error)}`,
    ].join('\n')
  }
}
