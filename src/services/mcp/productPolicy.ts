import { getProductRuntimeConfig } from '../../utils/productMode.js'
import type { ScopedMcpServerConfig } from './types.js'

export function filterMcpConfigsForProduct(
  configs: Record<string, ScopedMcpServerConfig>,
): Record<string, ScopedMcpServerConfig> {
  if (getProductRuntimeConfig()?.product !== 'chat') return configs
  return Object.fromEntries(
    Object.entries(configs).filter(([, config]) => config.type !== 'stdio'),
  )
}
