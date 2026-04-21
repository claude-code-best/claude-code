/**
 * Companion reaction system — adapted for Pokémon buddy system.
 *
 * Called from REPL.tsx after each query turn. Checks mute state, frequency
 * limits, and @-mention detection, then calls the buddy_react API to
 * generate a reaction shown in the CompanionSprite speech bubble.
 */
import { getGlobalConfig } from '../utils/config.js'
import { getClaudeAIOAuthTokens } from '../utils/auth.js'
import { getOauthConfig } from '../constants/oauth.js'
import { getUserAgent } from '../utils/http.js'
import type { Message } from '../types/message.js'
import {
  loadBuddyData,
  getActiveCreature,
  getCreatureName,
  calculateStats,
  getSpeciesData,
  type Creature,
} from '@claude-code-best/pokemon'

// ─── Rate limiting ──────────────────────────────────

let lastReactTime = 0
const MIN_INTERVAL_MS = 45_000

// ─── Recent reactions (avoid repetition) ────────────

const recentReactions: string[] = []
const MAX_RECENT = 8

// ─── Public API ─────────────────────────────────────

/**
 * Trigger a companion reaction after a query turn.
 */
export function triggerCompanionReaction(
  messages: Message[],
  setReaction: (text: string | undefined) => void,
): void {
  const data = loadBuddyData()
  const creature = getActiveCreature(data)
  if (!creature || getGlobalConfig().companionMuted) return

  const name = getCreatureName(creature)
  const addressed = isAddressed(messages, name)

  const now = Date.now()
  if (!addressed && now - lastReactTime < MIN_INTERVAL_MS) return

  const transcript = buildTranscript(messages)
  if (!transcript.trim()) return

  lastReactTime = now

  void callBuddyReactAPI(creature, transcript, addressed)
    .then(reaction => {
      if (!reaction) return
      recentReactions.push(reaction)
      if (recentReactions.length > MAX_RECENT) recentReactions.shift()
      setReaction(reaction)
    })
    .catch(() => {})
}

// ─── Helpers ────────────────────────────────────────

function isAddressed(messages: Message[], name: string): boolean {
  const pattern = new RegExp(`\\b${escapeRegex(name)}\\b`, 'i')
  for (
    let i = messages.length - 1;
    i >= Math.max(0, messages.length - 3);
    i--
  ) {
    const m = messages[i]
    if (m?.type !== 'user') continue
    const content = (m as any).message?.content
    if (typeof content === 'string' && pattern.test(content)) return true
  }
  return false
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildTranscript(messages: Message[]): string {
  return messages
    .slice(-12)
    .filter(m => m.type === 'user' || m.type === 'assistant')
    .map(m => {
      const role = m.type === 'user' ? 'user' : 'claude'
      const content = (m as any).message?.content
      const text =
        typeof content === 'string'
          ? content.slice(0, 300)
          : Array.isArray(content)
            ? content
                .filter((b: any) => b?.type === 'text')
                .map((b: any) => b.text)
                .join(' ')
                .slice(0, 300)
            : ''
      return `${role}: ${text}`
    })
    .join('\n')
    .slice(0, 5000)
}

// ─── API call ───────────────────────────────────────

async function callBuddyReactAPI(
  creature: Creature,
  transcript: string,
  addressed: boolean,
): Promise<string | null> {
  const tokens = getClaudeAIOAuthTokens()
  if (!tokens?.accessToken) return null

  const orgId = getGlobalConfig().oauthAccount?.organizationUuid
  if (!orgId) return null

  const species = getSpeciesData(creature.speciesId)
  const name = getCreatureName(creature)
  const stats = calculateStats(creature)

  const baseUrl = getOauthConfig().BASE_API_URL
  const url = `${baseUrl}/api/organizations/${orgId}/claude_code/buddy_react`

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      'Content-Type': 'application/json',
      'User-Agent': getUserAgent(),
    },
    body: JSON.stringify({
      name: name.slice(0, 32),
      personality: species.personality.slice(0, 200),
      species: creature.speciesId,
      rarity: creature.isShiny
        ? 'legendary'
        : creature.level >= 36
          ? 'epic'
          : creature.level >= 16
            ? 'rare'
            : 'common',
      stats: {
        HP: stats.hp,
        ATK: stats.attack,
        DEF: stats.defense,
        SPA: stats.spAtk,
        SPD: stats.spDef,
        SPE: stats.speed,
        Level: creature.level,
      },
      transcript,
      reason: addressed ? 'addressed' : 'turn',
      recent: recentReactions.map(r => r.slice(0, 200)),
      addressed,
    }),
    signal: AbortSignal.timeout(10_000),
  })

  if (!resp.ok) return null

  try {
    const data = (await resp.json()) as { reaction?: string }
    return data.reaction?.trim() || null
  } catch {
    return null
  }
}
