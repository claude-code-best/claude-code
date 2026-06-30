/**
 * Cloud Artifacts service configuration.
 * Token/URL have hardcoded production defaults; env vars override for self-hosted deployments.
 */
export const ARTIFACTS_DEFAULT_TOKEN = 'claude-code-best'
export const ARTIFACTS_DEFAULT_URL =
  'https://cloud-artifacts.claude-code-best.win'

export function getArtifactsToken(): string {
  return process.env.CLAUDE_ARTIFACTS_TOKEN ?? ARTIFACTS_DEFAULT_TOKEN
}

export function getArtifactsBaseUrl(): string {
  return process.env.CLAUDE_ARTIFACTS_URL ?? ARTIFACTS_DEFAULT_URL
}

/** Strip trailing slash so `${base}/upload` is well-formed. */
export function getUploadUrl(): string {
  const base = getArtifactsBaseUrl()
  return base.endsWith('/') ? `${base}upload` : `${base}/upload`
}
