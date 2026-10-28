/**
 * P1: CLI-owned system layout. Rust must not construct billing.
 *
 * The kernel JSON is the live authority for native slots. Environment variables
 * remain fallback values for standalone CLI runs without a Kin kernel.
 */
import { readKinRuntimeConfig, type KinRuntimeConfig } from './runtimeConfig.js'

export const IDENTITY =
  "You are a Claude agent, built on Anthropic's Claude Agent SDK."
export const COMPACT_IDENTITY = 'You are Anthropic Claude Agent SDK.'

export type SystemLayout = 'stock' | 'zero' | 'identity'

export function getSystemLayout(runtime?: KinRuntimeConfig): SystemLayout {
  if (runtime) return runtime.system_layout
  if (process.env.CLAUDE_CODE_KIN_NATIVE_SLOTS) {
    return readKinRuntimeConfig().system_layout
  }
  const raw = (
    process.env.CLAUDE_CODE_SYSTEM_LAYOUT ||
    process.env.KIN_SYSTEM_MODE ||
    ''
  )
    .trim()
    .toLowerCase()
  if (raw === 'zero') return 'zero'
  if (raw === 'identity' || raw === 'id' || raw === 'block') return 'identity'
  return 'stock'
}

export function getKinTimezone(runtime?: KinRuntimeConfig): string {
  if (runtime?.timezone) return runtime.timezone
  if (process.env.CLAUDE_CODE_KIN_NATIVE_SLOTS) {
    return readKinRuntimeConfig().timezone || 'America/New_York'
  }
  const tz = (
    process.env.CLAUDE_CODE_TIMEZONE ||
    process.env.KIN_SLOT_TZ ||
    process.env.TZ ||
    'America/New_York'
  ).trim()
  return tz || 'America/New_York'
}

export function environmentBlock(timezone = getKinTimezone()): string {
  return `# Environment\nTime zone: ${timezone}`
}

function stableAttributionHeader(attribution: string): string {
  // cch is replaced by Bun's request attestation on every request, and
  // cc_workload is turn-scoped. Neither belongs before a message breakpoint:
  // either value invalidates the whole native conversation cache prefix.
  return attribution
    .replace(/\s+cch=[^;\s]+;/gi, '')
    .replace(/\s+cc_workload=[^;\s]+;/gi, '')
}

export function layoutSystemBlocks(opts: {
  attribution: string
  leftover?: string
  officialFullPrompt?: readonly string[]
  runtime?: KinRuntimeConfig
}): string[] {
  const layout = getSystemLayout(opts.runtime)
  const persona =
    opts.runtime?.persona_preset ?? (layout === 'zero' ? 'zero' : 'official')
  const attribution = stableAttributionHeader((opts.attribution || '').trim())
  const leftover = opts.leftover?.trim()
  const blocks: string[] = []

  if (persona === 'zero' || layout === 'zero') {
    const billing = attribution
      ? attribution.replace(/;?\s*$/, '') +
        `; prompt_version=${COMPACT_IDENTITY};`
      : `x-anthropic-billing-header: prompt_version=${COMPACT_IDENTITY};`
    blocks.push(billing)
    if (leftover) blocks.push(leftover)
    return blocks
  }

  if (attribution) blocks.push(attribution)
  blocks.push(IDENTITY)
  if (persona === 'official_full') {
    const full = opts.officialFullPrompt?.filter(Boolean).join('\n\n').trim()
    if (full) blocks.push(full)
    else blocks.push(environmentBlock(getKinTimezone(opts.runtime)))
  }
  if (leftover) blocks.push(leftover)
  return blocks
}

export function leftoverFromSystemPrompt(
  systemPrompt: readonly string[],
): string | undefined {
  const parts: string[] = []
  for (const block of systemPrompt) {
    const text = (block || '').trim()
    if (!text) continue
    if (text.startsWith('x-anthropic-billing-header')) continue
    if (text === IDENTITY) continue
    if (text.startsWith('# Environment')) continue
    if (text.includes('mcp__kin_runtime__') || text.includes('persistent Kin'))
      continue
    parts.push(text)
  }
  return parts.length ? parts.join('\n\n') : undefined
}
