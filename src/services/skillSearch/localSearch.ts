import { logForDebugging } from '../../utils/debug.js'

export interface SkillIndexEntry {
  name: string
  normalizedName: string
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

const CJK_RANGE = /[\u4e00-\u9fff\u3400-\u4dbf]/

function isCjk(ch: string): boolean {
  return CJK_RANGE.test(ch)
}

/**
  * tokenize 把「可检索文本」变成统一格式的词元序列，供后面的 TF–IDF + 余弦相似度 做本地技能/命令匹配；
  * 英文靠「词 + 停词」、中文靠「连续汉字上的二字切片」来近似匹配，而不依赖外部分词库
  * "数据库迁移" ——> "数据"、“据库”，"库迁"、"迁移"
  */
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
      // 在每个连续的 CJK 片段内做滑动二字切片。
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

const FIELD_WEIGHT = {
  name: 3.0,
  whenToUse: 2.0,
  description: 1.0,
  allowedTools: 0.3,
} as const

/**
 * 按「字段」计算加权词频，供后续与 IDF 相乘及余弦相似度使用。
 * 每个字段内：先统计词频，再用该字段内的最大频数归一化（主导词相对为 1），再乘以字段权重；
 * 同一词出现在多个字段时，取各字段加权结果的最大值（不累加）。
 *
 * 数据举例（两组字段）：
 * - name 权重 3，词元 `[deploy, deploy, cloud]` → 频数 deploy=2、cloud=1，max=2
 *   → deploy: (2/2)×3 = 3，cloud: (1/2)×3 = 1.5
 * - description 权重 1，词元 `[cloud, api, api]` → max=2
 *   → cloud: (1/2)×1 = 0.5，api: (2/2)×1 = 1
 * 合并：`deploy→3`，`cloud→max(1.5, 0.5)=1.5`，`api→1`
 */
function computeWeightedTf(
  fields: { tokens: string[]; weight: number }[],
): Map<string, number> {
  const weighted = new Map<string, number>()
  for (const field of fields) {
    const freq = new Map<string, number>()
    for (const t of field.tokens) freq.set(t, (freq.get(t) ?? 0) + 1)
    let max = 1
    for (const v of freq.values()) if (v > max) max = v
    for (const [term, count] of freq) {
      const val = (count / max) * field.weight
      const existing = weighted.get(term) ?? 0
      if (val > existing) weighted.set(term, val)
    }
  }
  return weighted
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

const DISPLAY_MIN_SCORE = Number(
  process.env.SKILL_SEARCH_DISPLAY_MIN_SCORE ?? '0.10',
)
const NAME_MATCH_BONUS = 0.4
const NAME_MATCH_MIN_LENGTH = 4
const CJK_MIN_BIGRAM_MATCHES = 2

//把下划线替换成空格。
function normalizeSkillName(name: string): string {
  return name.toLowerCase().replace(/[-_]/g, ' ')
}

/**
 * 将连字符/下划线形式的技能名拆成若干片段，供检索索引补充词元。
 * 过滤长度不足 3 的片段，避免过短噪声（如前缀缩写）干扰 TF 匹配。
 *
 * 示例：
 * - `my-plugin-helper` → 先拆成 my、plugin、helper → 保留 `["plugin","helper"]`（my 仅 2 字，丢弃）
 * - `api-v2-setup` → `["api","setup"]`（v2 仅 2 字，丢弃）
 * - `git-commit-msg` → `["git","commit","msg"]`（三段均 ≥3）
 */
function splitHyphenatedName(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[-_]/)
    .filter(p => p.length >= 3)
}

let cachedIndex: SkillIndexEntry[] | null = null
let cachedIdf: Map<string, number> | null = null
let cachedCwd: string | null = null

export function clearSkillIndexCache(): void {
  cachedIndex = null
  cachedIdf = null
  cachedCwd = null
  logForDebugging('[skill-search] index cache cleared')
}

export async function getSkillIndex(cwd: string): Promise<SkillIndexEntry[]> {
  if (cachedIndex && cachedCwd === cwd) return cachedIndex

  const { getCommands } = await import('../../commands.js')
  const commands = await getCommands(cwd)

  const entries: SkillIndexEntry[] = []
  for (const cmd of commands) {
    if ((cmd as Record<string, unknown>).type !== 'prompt') continue
    if ((cmd as Record<string, unknown>).disableModelInvocation) continue //禁止模型调用此命令

    const name = cmd.name
    const description = cmd.description ?? ''
    const whenToUse = (cmd as Record<string, unknown>).whenToUse as
      | string
      | undefined
    const allowedTools =
      (
        (cmd as Record<string, unknown>).allowedTools as string[] | undefined
      )?.join(' ') ?? ''

    const nameTokens = tokenizeAndStem(name)
    const nameParts = splitHyphenatedName(name)
    const nameWithParts = [
      ...nameTokens,
      ...nameParts.map(stem).filter(t => !STOP_WORDS.has(t)),
    ]

    const descTokens = tokenizeAndStem(description)
    const whenTokens = tokenizeAndStem(whenToUse ?? '')
    const toolsTokens = tokenizeAndStem(allowedTools)

    const allTokens = [
      ...new Set([
        ...nameWithParts,
        ...descTokens,
        ...whenTokens,
        ...toolsTokens,
      ]),
    ]

    const tfVector = computeWeightedTf([
      { tokens: nameWithParts, weight: FIELD_WEIGHT.name },
      { tokens: whenTokens, weight: FIELD_WEIGHT.whenToUse },
      { tokens: descTokens, weight: FIELD_WEIGHT.description },
      { tokens: toolsTokens, weight: FIELD_WEIGHT.allowedTools },
    ])

    entries.push({
      name,
      normalizedName: normalizeSkillName(name),
      description,
      whenToUse,
      source: ((cmd as Record<string, unknown>).source as string) ?? 'unknown', //资源类别：userSettings，projectSettings，localSettings，flagSettings，policySettings， 'builtin' | 'mcp' | 'plugin' | 'bundled'
      loadedFrom: (cmd as Record<string, unknown>).loadedFrom as //来源类别： 'commands_DEPRECATED' 'skills' 'plugin' 'managed' 'bundled'  'mcp' 
        | string
        | undefined,
      skillRoot: (cmd as Record<string, unknown>).skillRoot as //skill所在根目录
        | string
        | undefined,
      contentLength: (cmd as Record<string, unknown>).contentLength as //Skill的内容长度
        | number
        | undefined,
      tokens: allTokens, //词元
      tfVector, //词频权重
    })
  }

  const idf = computeIdf(entries)

  for (const entry of entries) {
    for (const [term, tf] of entry.tfVector) {
      entry.tfVector.set(term, tf * (idf.get(term) ?? 0))
    }
  }

  cachedIndex = entries
  cachedIdf = idf
  cachedCwd = cwd
  logForDebugging(
    `[skill-search] indexed ${entries.length} skills from ${commands.length} commands`,
  )
  return entries
}
/**
 * tokenize + stemming（英语）以及对中文做 CJK bigram（两字片段）
对 skill 的不同字段做加权 TF（name 权重最高、whenToUse 次之、description 再次、allowedTools 很低）
计算 IDF（基于 index 里 DF）
cosine similarity
一些启发式：
CJK bigram 命中太少会把 score 清零（除非有 ascii token 命中）
query 包含 skill name（normalized）时强行把 score 抬到至少 0.75
只返回 score >= SKILL_SEARCH_DISPLAY_MIN_SCORE（默认 0.10）
默认取 top 5
 * @param query 
 * @param index 
 * @param limit 
 * @returns 
 */
export function searchSkills(
  query: string,
  index: SkillIndexEntry[],
  limit = 5,
): SearchResult[] {
  if (index.length === 0 || !query.trim()) return []

  const queryTokens = tokenizeAndStem(query)
  if (queryTokens.length === 0) return []

  const queryTf = new Map<string, number>()
  const freq = new Map<string, number>()
  for (const t of queryTokens) freq.set(t, (freq.get(t) ?? 0) + 1)
  let max = 1
  for (const v of freq.values()) if (v > max) max = v
  for (const [term, count] of freq) queryTf.set(term, count / max)

  const idf = cachedIdf ?? computeIdf(index)
  const queryTfIdf = new Map<string, number>()
  for (const [term, tf] of queryTf) {
    queryTfIdf.set(term, tf * (idf.get(term) ?? 0))
  }

  const queryCjkTokens = queryTokens.filter(t => isCjk(t[0] ?? ''))
  const queryAsciiTokens = queryTokens.filter(t => !isCjk(t[0] ?? ''))
  const queryLower = query.toLowerCase().replace(/[-_]/g, ' ')

  const results: SearchResult[] = []
  for (const entry of index) {
    let score = cosineSimilarity(queryTfIdf, entry.tfVector)

    if (queryCjkTokens.length > 0 && score > 0) {
      const matchingCjk = queryCjkTokens.filter(t => entry.tfVector.has(t))
      if (matchingCjk.length < CJK_MIN_BIGRAM_MATCHES) {
        const hasAsciiMatch = queryAsciiTokens.some(t => entry.tfVector.has(t))
        if (!hasAsciiMatch) score = 0
      }
    }

    if (entry.name.length >= NAME_MATCH_MIN_LENGTH) {
      if (queryLower.includes(entry.normalizedName)) {
        score = Math.max(score, 0.75)
      }
    }

    if (score >= DISPLAY_MIN_SCORE) {
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
