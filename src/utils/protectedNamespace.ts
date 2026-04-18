/**
 * Protected Namespace — check if running in a protected k8s namespace.
 * Used for telemetry in Anthropic internal infra. Returns false for
 * external/local environments.
 */

const OPEN_NAMESPACES = new Set(['homespace', 'dev', 'local', 'default'])

export function checkProtectedNamespace(): boolean {
  const hasInfraSignal = !!(
    process.env.KUBERNETES_SERVICE_HOST || process.env.COO_ENVIRONMENT
  )
  if (!hasInfraSignal) return false

  const namespace =
    process.env.NAMESPACE ??
    process.env.K8S_NAMESPACE ??
    process.env.POD_NAMESPACE ??
    ''

  return !!namespace && !OPEN_NAMESPACES.has(namespace.toLowerCase())
}
