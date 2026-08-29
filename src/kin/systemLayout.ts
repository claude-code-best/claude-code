/**
 * P1: CLI-owned system layout. Rust must not construct billing.
 *
 * zero:     attribution + ` prompt_version=official sentence;` in one block
 * identity: attribution block, then official sentence block
 * Always append `# Environment\nTime zone: <IANA>` and optional leftover.
 *
 * cch is whatever getAttributionHeader() already emitted. Node builds omit it.
 */
export const IDENTITY =
  "You are a Claude agent, built on Anthropic's Claude Agent SDK."

export type SystemLayout = 'stock' | 'zero' | 'identity'

export function getSystemLayout(): SystemLayout {
  const raw = (
    process.env.CLAUDE_CODE_SYSTEM_LAYOUT ||
    process.env.KIN_SYSTEM_MODE ||
    ''
  )
    .trim()
    .toLowerCase()
  if (raw === 'zero') return 'zero'
  if (raw === 'identity' || raw === 'id' || raw === 'block') return 'identity'
  if (process.env.CLAUDE_CODE_KIN_NATIVE_SLOTS) return 'zero'
  return 'stock'
}

export function getKinTimezone(): string {
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

export function layoutSystemBlocks(opts: {
  attribution: string
  leftover?: string
}): string[] {
  const layout = getSystemLayout()
  const attribution = (opts.attribution || '').trim()
  const leftover = opts.leftover?.trim()
  const env = environmentBlock()
  const blocks: string[] = []

  if (layout === 'zero') {
    const billing = attribution
      ? attribution.replace(/;?\s*$/, '') + `; prompt_version=${IDENTITY};`
      : `x-anthropic-billing-header: prompt_version=${IDENTITY};`
    blocks.push(billing)
  } else {
    if (attribution) blocks.push(attribution)
    blocks.push(IDENTITY)
  }
  blocks.push(env)
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
