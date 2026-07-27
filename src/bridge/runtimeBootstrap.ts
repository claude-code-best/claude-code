import { enableConfigs } from '../utils/config.js'
import { applySafeConfigEnvironmentVariables } from '../utils/managedEnv.js'
import { hydrateProviderSecretsIntoEnv } from '../services/providerRegistry/providerSecrets.js'

/**
 * Prepare the environment shared by normal bridge CLI and headless workers.
 * Provider routing/auth values are applied before catalog resolution and
 * durable provider secrets are hydrated before a Session CLI is spawned.
 */
export function prepareBridgeRuntimeEnvironment(
  env: Record<string, string | undefined> = process.env,
): void {
  enableConfigs()
  applySafeConfigEnvironmentVariables()
  hydrateProviderSecretsIntoEnv(env)
}
