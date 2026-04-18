import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

export type SkillIndexEntry = {
  name: string
  description: string
  whenToUse?: string
  source: string
  loadedFrom?: string
  skillRoot?: string
  contentLength?: number
  tokens: string[]
  tfVector: Map<string, number>
}

export type SearchResult = {
  name: string
  description: string
  score: number
  entry: SkillIndexEntry
}

const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
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
  'about',
  'up',
  'that',
  'this',
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
])

const CJK_RANGE = /[\u4e00-\u9fff\u3400-\u4dbf]/

function isCjk(ch: string): boolean {
  return CJK_RANGE.test(ch)
}

export function tokenize(text: string): string[] {
  const tokens: string[] = []
  const lower = text.toLowerCase()
  let i = 0

  while (i < lower.length) {
    if (isCjk(lower[i]!)) {
      let cjkRun = ''
      while (i < lower.length && isCjk(lower[i]!)) {
        cjkRun += lower[i]
        i++
      }
      for (let j = 0; j < cjkRun.length - 1; j++) {
        tokens.push(cjkRun.slice(j, j + 2))
      }
    } else if (/[a-z0-9]/.test(lower[i]!)) {
      let word = ''
      while (i < lower.length && /[a-z0-9\-_]/.test(lower[i]!)) {
        word += lower[i]
        i++
      }
      const cleaned = word.replace(/^[-_]+|[-_]+$/g, '')
      if (cleaned && !STOP_WORDS.has(cleaned)) {
        tokens.push(cleaned)
      }
    } else {
      i++
    }
  }

  return tokens
}

function stem(word: string): string {
  if (isCjk(word[0] ?? '')) return word
  let s = word
  if (s.endsWith('ing') && s.length > 5) s = s.slice(0, -3)
  else if (s.endsWith('tion') && s.length > 5) s = s.slice(0, -4)
  else if (s.endsWith('ness') && s.length > 5) s = s.slice(0, -4)
  else if (s.endsWith('ment') && s.length > 5) s = s.slice(0, -4)
  else if (s.endsWith('ers') && s.length > 4) s = s.slice(0, -1)
  else if (s.endsWith('er') && s.length > 4) s = s.slice(0, -2)
  else if (s.endsWith('es') && s.length > 4) s = s.slice(0, -2)
  else if (s.endsWith('s') && s.length > 3 && !s.endsWith('ss'))
    s = s.slice(0, -1)
  else if (s.endsWith('ed') && s.length > 4) s = s.slice(0, -2)
  else if (s.endsWith('ly') && s.length > 4) s = s.slice(0, -2)
  return s
}

export function tokenizeAndStem(text: string): string[] {
  return tokenize(text).map(stem)
}

function buildTfVector(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>()
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1)
  const max = Math.max(...freq.values(), 1)
  const tf = new Map<string, number>()
  for (const [term, count] of freq) tf.set(term, count / max)
  return tf
}

export function searchSkills(
  query: string,
  index: SkillIndexEntry[],
  limit: number,
): SearchResult[] {
  if (index.length === 0) return []

  const queryTokens = tokenizeAndStem(query)
  if (queryTokens.length === 0) return []

  const docCount = index.length
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

  const results: SearchResult[] = []

  for (const entry of index) {
    let score = 0
    for (const qt of queryTokens) {
      const tf = entry.tfVector.get(qt) ?? 0
      if (tf > 0) {
        const docFreq = df.get(qt) ?? 1
        const idf = Math.log(1 + docCount / docFreq)
        score += tf * idf
      }
    }
    if (score > 0) {
      results.push({
        name: entry.name,
        description: entry.description,
        score,
        entry,
      })
    }
  }

  results.sort((a, b) => b.score - a.score)
  return results.slice(0, limit)
}

let cachedIndex: { root: string; entries: SkillIndexEntry[] } | null = null

export function clearSkillIndexCache(): void {
  cachedIndex = null
}

export async function getSkillIndex(
  rootDir: string,
): Promise<SkillIndexEntry[]> {
  if (cachedIndex && cachedIndex.root === rootDir) return cachedIndex.entries

  const entries: SkillIndexEntry[] = []
  const skillsDir = join(rootDir, '.claude', 'skills')

  try {
    const dirs = readdirSync(skillsDir)
    for (const name of dirs) {
      const skillDir = join(skillsDir, name)
      try {
        if (!statSync(skillDir).isDirectory()) continue
      } catch {
        continue
      }
      const skillFile = join(skillDir, 'SKILL.md')
      let content: string
      try {
        content = readFileSync(skillFile, 'utf8')
      } catch {
        continue
      }
      const description = content.slice(0, 200)
      const tokens = tokenizeAndStem(`${name} ${description}`)
      entries.push({
        name,
        description,
        source: 'project',
        loadedFrom: skillFile,
        skillRoot: skillDir,
        contentLength: content.length,
        tokens,
        tfVector: buildTfVector(tokens),
      })
    }
  } catch {
    // skills dir doesn't exist
  }

  cachedIndex = { root: rootDir, entries }
  return entries
}
