// Stub - security check disabled for open-source build
export function checkManagedSettingsSecurity() {
  return Promise.resolve({ ok: true })
}
export function handleSecurityCheckResult() {
  return true
}
