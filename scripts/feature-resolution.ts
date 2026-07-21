export function resolveEnabledFeatures(
  defaults: readonly string[],
  env: NodeJS.ProcessEnv,
  warn: (message: string) => void = console.warn,
): string[] {
  const enabled = new Set(defaults)
  const defaultSet = new Set(defaults)
  const trueValues = new Set(['1', 'true', 'yes', 'on'])
  const falseValues = new Set(['0', 'false', 'no', 'off'])

  for (const [key, rawValue] of Object.entries(env).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (!key.startsWith('FEATURE_')) continue
    const name = key.slice('FEATURE_'.length)
    const originalValue = rawValue ?? ''
    const value = originalValue.trim().toLowerCase()
    if (trueValues.has(value)) {
      enabled.add(name)
    } else if (falseValues.has(value)) {
      enabled.delete(name)
    } else {
      warn(
        `Ignoring ${key}=${originalValue}; expected 1/true/yes/on or 0/false/no/off`,
      )
    }
  }

  return [
    ...defaults.filter(name => enabled.has(name)),
    ...[...enabled]
      .filter(name => !defaultSet.has(name))
      .sort((left, right) => left.localeCompare(right)),
  ]
}
