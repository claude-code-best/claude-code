/**
 * Local Skill Search — TF-IDF based skill discovery engine.
 *
 * Builds an index from all registered skills (type=prompt commands),
 * then searches using cosine similarity on TF-IDF vectors.
 */
import { logForDebugging } from '../../utils/debug.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillIndexEntry {
  name: string
  description: string
  whenToUse: string | undefined
  source: string
  loadedFrom: string | undefined
  skillRoot: string | undefined
  contentLength: number | undefined
  tokens: string[]
  tfVector: Map<string, number>
}

export interface SearchResult {
  name: string
  description: string
  score: number
  shortId?: string
  source?: string
  loadedFrom?: string
  skillRoot?: string
  contentLength?: number
}

// ---------------------------------------------------------------------------
// Stop words and tokenization
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'shall',
  'can',
  'need',
  'dare',
  'ought',
  'used',
  'to',
  'of',
  'in',
  'for',
  'on',
  'with',
  'at',
  'by',
  'from',
  'as',
  'into',
  'through',
  'during',
  'before',
  'after',
  'above',
  'below',
  'between',
  'out',
  'off',
  'over',
  'under',
  'again',
  'further',
  'then',
  'once',
  'here',
  'there',
  'when',
  'where',
  'why',
  'how',
  'all',
  'each',
  'every',
  'both',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'nor',
  'not',
  'only',
  'own',
  'same',
  'so',
  'than',
  'too',
  'very',
  'just',
  'because',
  'but',
  'and',
  'or',
  'if',
  'while',
  'this',
  'that',
  'these',
  'those',
  'it',
  'its',
  'i',
  'me',
  'my',
  'we',
  'our',
  'you',
  'your',
  'he',
  'him',
  'his',
  'she',
  'her',
  'they',
  'them',
  'their',
  'what',
  'which',
  'who',
  'whom',
  'use',
  'using',
  'used',
])

const CJK_RANGE = /[\u4e00-\u9fff]+/g
const ASCII_ALNUM_REPLACE = /[^\u4e00-\u9fffa-z0-9]+/g

function cjkBigrams(segment: string): string[] {
  if (segment.length < 2) return []
  const bigrams: string[] = []
  for (let i = 0; i < segment.length - 1; i++) {
    bigrams.push(segment.slice(i, i + 2))
  }
  return bigrams
}

export function tokenize(text: string): string[] {
  const lower = text.toLowerCase()
  const tokens: string[] = []
  // CJK bi-grams: scan before we strip so the positional context is preserved.
  for (const match of lower.matchAll(CJK_RANGE)) {
    const segment = match[0]
    for (const bigram of cjkBigrams(segment)) {
      tokens.push(bigram)
    }
  }
  // ASCII / digit tokens: replace anything that is not CJK / alnum with spaces
  // so CJK runs don't bleed into their ASCII neighbours.
  for (const part of lower.replace(ASCII_ALNUM_REPLACE, ' ').split(' ')) {
    if (!part) continue
    // Skip CJK-only parts — those were handled above as bi-grams.
    if (/^[\u4e00-\u9fff]+$/.test(part)) continue
    // Strip any CJK chars mixed inside an ASCII run; the CJK side is already
    // represented as bi-grams.
    const ascii = part.replace(/[\u4e00-\u9fff]+/g, '')
    if (ascii.length > 1 && !STOP_WORDS.has(ascii)) {
      tokens.push(ascii)
    }
  }
  return tokens
}

function simpleStem(word: string): string {
  // CJK bi-grams are passed through unchanged — English suffix rules do not apply.
  if (/[\u4e00-\u9fff]/.test(word)) return word
  // Very basic suffix stripping
  if (word.endsWith('ing') && word.length > 5) return word.slice(0, -3)
  if (word.endsWith('tion') && word.length > 5) return word.slice(0, -4)
  if (word.endsWith('ed') && word.length > 4) return word.slice(0, -2)
  if (word.endsWith('ly') && word.length > 4) return word.slice(0, -2)
  if (word.endsWith('es') && word.length > 4) return word.slice(0, -2)
  if (word.endsWith('s') && word.length > 3 && !word.endsWith('ss'))
    return word.slice(0, -1)
  return word
}

export function tokenizeAndStem(text: string): string[] {
  return tokenize(text).map(simpleStem)
}

// ---------------------------------------------------------------------------
// TF-IDF
// ---------------------------------------------------------------------------

function computeTf(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>()
  for (const t of tokens) {
    freq.set(t, (freq.get(t) ?? 0) + 1)
  }
  const max = Math.max(...freq.values(), 1)
  const tf = new Map<string, number>()
  for (const [term, count] of freq) {
    tf.set(term, count / max)
  }
  return tf
}

function computeIdf(index: SkillIndexEntry[]): Map<string, number> {
  const df = new Map<string, number>()
  for (const entry of index) {
    const seen = new Set<string>()
    for (const t of entry.tokens) {
      if (!seen.has(t)) {
        df.set(t, (df.get(t) ?? 0) + 1)
        seen.add(t)
      }
    }
  }
  const N = index.length
  const idf = new Map<string, number>()
  for (const [term, count] of df) {
    idf.set(term, Math.log(N / count))
  }
  return idf
}

function cosineSimilarity(
  queryTfIdf: Map<string, number>,
  docTfIdf: Map<string, number>,
): number {
  let dot = 0
  let normQ = 0
  let normD = 0

  for (const [term, qWeight] of queryTfIdf) {
    const dWeight = docTfIdf.get(term) ?? 0
    dot += qWeight * dWeight
    normQ += qWeight * qWeight
  }
  for (const dWeight of docTfIdf.values()) {
    normD += dWeight * dWeight
  }

  const denom = Math.sqrt(normQ) * Math.sqrt(normD)
  return denom === 0 ? 0 : dot / denom
}

// ---------------------------------------------------------------------------
// Index cache
// ---------------------------------------------------------------------------

let cachedIndex: SkillIndexEntry[] | null = null
let cachedCwd: string | null = null

/**
 * Clear the memoized skill index. Called when commands change
 * (plugin reload, MCP tool change).
 */
export function clearSkillIndexCache(): void {
  cachedIndex = null
  cachedCwd = null
  logForDebugging('[skill-search] index cache cleared')
}

/**
 * Build or return cached skill index from all registered commands.
 */
export async function getSkillIndex(cwd: string): Promise<SkillIndexEntry[]> {
  if (cachedIndex && cachedCwd === cwd) return cachedIndex

  const { getCommands } = await import('../../commands.js')
  const commands = await getCommands(cwd)

  const entries: SkillIndexEntry[] = []
  for (const cmd of commands) {
    // Only index skills (type=prompt), not CLI commands
    if ((cmd as Record<string, unknown>).type !== 'prompt') continue
    // Skip skills that don't want model invocation
    if ((cmd as Record<string, unknown>).disableModelInvocation) continue

    const name = cmd.name
    const description = cmd.description ?? ''
    const whenToUse = (cmd as Record<string, unknown>).whenToUse as
      | string
      | undefined
    const allowedTools =
      (
        (cmd as Record<string, unknown>).allowedTools as string[] | undefined
      )?.join(' ') ?? ''

    const rawText = [name, description, whenToUse ?? '', allowedTools].join(' ')
    const tokens = tokenizeAndStem(rawText)
    const tfVector = computeTf(tokens)

    entries.push({
      name,
      description,
      whenToUse,
      source: ((cmd as Record<string, unknown>).source as string) ?? 'unknown',
      loadedFrom: (cmd as Record<string, unknown>).loadedFrom as
        | string
        | undefined,
      skillRoot: (cmd as Record<string, unknown>).skillRoot as
        | string
        | undefined,
      contentLength: (cmd as Record<string, unknown>).contentLength as
        | number
        | undefined,
      tokens,
      tfVector,
    })
  }

  // Compute IDF across all entries
  const idf = computeIdf(entries)

  // Apply IDF to each entry's TF vector → TF-IDF
  for (const entry of entries) {
    for (const [term, tf] of entry.tfVector) {
      entry.tfVector.set(term, tf * (idf.get(term) ?? 0))
    }
  }

  cachedIndex = entries
  cachedCwd = cwd
  logForDebugging(
    `[skill-search] indexed ${entries.length} skills from ${commands.length} commands`,
  )
  return entries
}

/**
 * Search the skill index using TF-IDF cosine similarity.
 */
export function searchSkills(
  query: string,
  index: SkillIndexEntry[],
  limit = 5,
): SearchResult[] {
  if (index.length === 0 || !query.trim()) return []

  const queryTokens = tokenizeAndStem(query)
  const queryTf = computeTf(queryTokens)

  // Compute query TF-IDF using the index's IDF
  const idf = computeIdf(index)
  const queryTfIdf = new Map<string, number>()
  for (const [term, tf] of queryTf) {
    queryTfIdf.set(term, tf * (idf.get(term) ?? 0))
  }

  const results: SearchResult[] = []
  for (const entry of index) {
    const score = cosineSimilarity(queryTfIdf, entry.tfVector)
    if (score > 0.05) {
      results.push({
        name: entry.name,
        description: entry.description,
        score,
        source: entry.source,
        loadedFrom: entry.loadedFrom,
        skillRoot: entry.skillRoot,
        contentLength: entry.contentLength,
      })
    }
  }

  results.sort((a, b) => b.score - a.score)
  return results.slice(0, limit)
}
