import { existsSync, readFileSync } from 'node:fs'

export type KinCacheTtl = '5m' | '1h'
export type KinPersonaPreset = 'zero' | 'official' | 'official_full'

export type KinRuntimeConfig = {
  default_cache_ttl: KinCacheTtl
  persona_preset: KinPersonaPreset
  system_layout: 'zero' | 'identity'
  timezone?: string
}

const DEFAULT_CONFIG_PATH = '/run/kin/kernel.json'

function normalizeCacheTtl(value: unknown): KinCacheTtl {
  return String(value ?? '')
    .trim()
    .toLowerCase() === '5m'
    ? '5m'
    : '1h'
}

function normalizePersonaPreset(value: unknown): KinPersonaPreset {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase()
  if (raw === 'zero' || raw === 'zero_inject' || raw === '0inject')
    return 'zero'
  if (raw === 'official_full' || raw === 'full') return 'official_full'
  return 'official'
}

function configPaths(): string[] {
  const configured = String(
    process.env.KIN_KERNEL_CONFIG_PATH || process.env.KIN_KERNEL_CONFIG || '',
  ).trim()
  return configured ? [configured, DEFAULT_CONFIG_PATH] : [DEFAULT_CONFIG_PATH]
}

/** Read kernel.json for every native job; panel writes are therefore hot-reloaded. */
export function readKinRuntimeConfig(): KinRuntimeConfig {
  for (const filePath of configPaths()) {
    if (!existsSync(filePath)) continue
    try {
      const raw = JSON.parse(readFileSync(filePath, 'utf8')) as Record<
        string,
        unknown
      >
      return {
        default_cache_ttl: normalizeCacheTtl(raw.default_cache_ttl),
        persona_preset: normalizePersonaPreset(raw.persona_preset),
        system_layout: raw.system_layout === 'zero' ? 'zero' : 'identity',
        ...(typeof raw.timezone === 'string' && raw.timezone.trim()
          ? { timezone: raw.timezone.trim() }
          : {}),
      }
    } catch {}
  }
  return {
    default_cache_ttl: '1h',
    persona_preset: 'official',
    system_layout: 'identity',
  }
}
