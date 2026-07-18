export type StackMode = 'local' | 'dev'

export interface StackConfig {
  mode: StackMode
  host: string
  port: number
  healthUrl: string
  webUrl: string
  rcsEnv: Record<string, string>
  workerEnv: Record<string, string>
  apiKeyCount: number
  publicSummary: {
    mode: StackMode
    rcsUrl: string
    webUrl: string
    apiKeyCount: number
    apiKeySource: 'generated' | 'environment'
  }
}

export function resolveStackConfig(
  mode: StackMode,
  env: NodeJS.ProcessEnv,
  randomSecret: () => string = () => randomBytes(32).toString('base64url'),
): StackConfig {
  const host = env.RCS_HOST?.trim() || '127.0.0.1'
  const port = Number(env.RCS_PORT || '3000')
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error(
      `RCS_PORT must be an integer between 1 and 65535: ${env.RCS_PORT}`,
    )
  }

  const apiKeySource =
    env.RCS_API_KEYS === undefined ? 'generated' : 'environment'
  const apiKeys =
    env.RCS_API_KEYS === undefined
      ? [randomSecret()]
      : env.RCS_API_KEYS.split(',')
          .map(value => value.trim())
          .filter(Boolean)
  if (apiKeys.length === 0) {
    throw new Error('RCS_API_KEYS must contain at least one non-empty key')
  }

  const connectHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host
  const localBaseUrl = `http://${connectHost}:${port}`
  const bridgeBaseUrl = env.CLAUDE_BRIDGE_BASE_URL || localBaseUrl
  const webUrl =
    mode === 'dev' ? 'http://127.0.0.1:5173/code/' : `${localBaseUrl}/code/`

  return {
    mode,
    host,
    port,
    healthUrl: `${localBaseUrl}/health`,
    webUrl,
    rcsEnv: {
      RCS_API_KEYS: apiKeys.join(','),
      RCS_HOST: host,
      RCS_PORT: String(port),
      RCS_SINGLE_USER: env.RCS_SINGLE_USER ?? '1',
    },
    workerEnv: {
      CLAUDE_BRIDGE_BASE_URL: bridgeBaseUrl,
      CLAUDE_BRIDGE_OAUTH_TOKEN: apiKeys[0]!,
      CLAUDE_BRIDGE_SESSION_INGRESS_URL:
        env.CLAUDE_BRIDGE_SESSION_INGRESS_URL || bridgeBaseUrl,
    },
    apiKeyCount: apiKeys.length,
    publicSummary: {
      mode,
      rcsUrl: localBaseUrl,
      webUrl,
      apiKeyCount: apiKeys.length,
      apiKeySource,
    },
  }
}

export function needsProductionWebBuild(
  mode: StackMode,
  distExists: boolean,
): boolean {
  return mode === 'local' && !distExists
}
import { randomBytes } from 'node:crypto'
