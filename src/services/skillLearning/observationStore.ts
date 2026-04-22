import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type {
  SkillLearningProjectContext as BaseSkillLearningProjectContext,
  SkillLearningScope,
  SkillObservation as BaseSkillObservation,
  SkillObservationEvent,
  SkillObservationOutcome,
} from './types.js'

export type { SkillLearningScope, SkillObservation } from './types.js'

export type SkillLearningProjectContext = Pick<
  BaseSkillLearningProjectContext,
  'projectId' | 'projectName' | 'cwd'
> &
  Partial<
    Omit<BaseSkillLearningProjectContext, 'projectId' | 'projectName' | 'cwd'>
  >

export type ObservationEvent = Exclude<SkillObservationEvent, 'tool_error'>

export type ObservationOutcome = SkillObservationOutcome | 'interrupted'

export type StoredSkillObservation = Omit<
  BaseSkillObservation,
  'event' | 'outcome' | 'toolInput' | 'toolOutput'
> & {
  event: ObservationEvent
  outcome?: ObservationOutcome
  toolInput?: string
  toolOutput?: string
  toolName?: string
  messageText?: string
  source?: 'transcript' | 'hook' | 'tool-hook' | 'imported'
  contentHash?: string
  // Turn index at which the observation was captured. Used by
  // runtimeObserver to scope tool-hook observations to the current REPL
  // turn for scoping tool-hook records to the current REPL turn.
  turn?: number
}

export type ObservationStoreOptions = {
  rootDir?: string
  project?: SkillLearningProjectContext
  maxFieldLength?: number
  archiveThresholdBytes?: number
}

type ClaudeTranscriptEntry = {
  sessionId?: string
  cwd?: string
  timestamp?: string
  type?: string
  message?: {
    role?: string
    content?: unknown
  }
  tool_name?: string
  tool_input?: unknown
  tool_response?: unknown
}

const DEFAULT_MAX_FIELD_LENGTH = 5_000
const DEFAULT_ARCHIVE_THRESHOLD_BYTES = 1_000_000
const DEFAULT_PURGE_MAX_AGE_DAYS = 30
const SECRET_REPLACEMENT = '[REDACTED]'

const SECRET_PATTERNS: RegExp[] = [
  /\b(?:sk|sk-ant|sk-proj|xox[baprs])-[A-Za-z0-9_-]{12,}\b/g,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  /\b(?:api[_-]?key|token|secret|password|authorization)\b\s*[:=]\s*["']?[^"',\s}]+/gi,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/gi,
]

export function getSkillLearningRoot(
  options?: ObservationStoreOptions,
): string {
  if (options?.rootDir) return options.rootDir
  if (process.env.CLAUDE_SKILL_LEARNING_HOME) {
    return process.env.CLAUDE_SKILL_LEARNING_HOME
  }
  return join(process.env.HOME ?? process.cwd(), '.claude', 'skill-learning')
}

export function getObservationFilePath(
  options?: ObservationStoreOptions,
): string {
  const root = getSkillLearningRoot(options)
  const project = options?.project
  if (
    !project ||
    project.scope === 'global' ||
    project.projectId === 'global'
  ) {
    return join(root, 'global', 'observations.jsonl')
  }
  return join(root, 'projects', project.projectId, 'observations.jsonl')
}

export function scrubText(
  value: string | undefined,
  maxLength = DEFAULT_MAX_FIELD_LENGTH,
): string | undefined {
  if (value === undefined) return undefined

  let scrubbed = value
  for (const pattern of SECRET_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, match => {
      const key = match.split(/[:=]/, 1)[0]
      return /[:=]/.test(match)
        ? `${key}: ${SECRET_REPLACEMENT}`
        : SECRET_REPLACEMENT
    })
  }

  if (scrubbed.length <= maxLength) return scrubbed

  const hash = hashText(scrubbed)
  let preview = scrubbed.slice(0, maxLength)
  if (
    scrubbed.includes(SECRET_REPLACEMENT) &&
    !preview.includes(SECRET_REPLACEMENT)
  ) {
    preview = `${SECRET_REPLACEMENT} ${preview}`
  }
  return `${preview}\n[TRUNCATED length=${scrubbed.length} sha256=${hash}]`
}

export function scrubObservation(
  observation: StoredSkillObservation,
  options?: ObservationStoreOptions,
): StoredSkillObservation {
  const maxLength = options?.maxFieldLength ?? DEFAULT_MAX_FIELD_LENGTH
  const scrubbed: StoredSkillObservation = {
    ...observation,
    toolInput: scrubText(observation.toolInput, maxLength),
    toolOutput: scrubText(observation.toolOutput, maxLength),
    messageText: scrubText(observation.messageText, maxLength),
  }

  const hashSource = [
    scrubbed.event,
    scrubbed.toolName ?? '',
    scrubbed.toolInput ?? '',
    scrubbed.toolOutput ?? '',
    scrubbed.messageText ?? '',
  ].join('\n')

  return {
    ...scrubbed,
    contentHash: hashText(hashSource),
  }
}

const MAX_SINGLE_OBSERVATION_BYTES = 64 * 1024

export async function appendObservation(
  observation: StoredSkillObservation,
  options?: ObservationStoreOptions,
): Promise<StoredSkillObservation> {
  const filePath = getObservationFilePath(options)
  await mkdir(dirname(filePath), { recursive: true })
  await archiveLargeObservationFile(options)

  const scrubbed = scrubObservation(observation, options)
  const serialized = JSON.stringify(scrubbed)
  if (Buffer.byteLength(serialized) > MAX_SINGLE_OBSERVATION_BYTES) {
    return scrubbed
  }
  await writeFile(filePath, `${serialized}\n`, {
    flag: 'a',
  })
  return scrubbed
}

export async function readObservations(
  options?: ObservationStoreOptions,
): Promise<StoredSkillObservation[]> {
  const filePath = getObservationFilePath(options)
  let content = ''
  try {
    content = await readFile(filePath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }

  const observations: StoredSkillObservation[] = []
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue
    try {
      observations.push(JSON.parse(line) as StoredSkillObservation)
    } catch {
      // Skip corrupt/truncated JSONL lines (e.g. from concurrent append
      // interleaved with a crash). One bad line must not break the whole read.
    }
  }
  return observations
}

export async function ingestTranscript(
  transcriptPath: string,
  options?: ObservationStoreOptions,
): Promise<StoredSkillObservation[]> {
  const transcript = await readFile(transcriptPath, 'utf8')
  const observations: StoredSkillObservation[] = []

  for (const line of transcript.split(/\r?\n/)) {
    if (!line.trim()) continue

    const entry = JSON.parse(line) as ClaudeTranscriptEntry
    for (const observation of observationsFromTranscriptEntry(entry, options)) {
      observations.push(await appendObservation(observation, options))
    }
  }

  return observations
}

export async function purgeOldObservations(
  options?: ObservationStoreOptions & { maxAgeDays?: number },
): Promise<number> {
  const filePath = getObservationFilePath(options)
  const maxAgeDays = options?.maxAgeDays ?? DEFAULT_PURGE_MAX_AGE_DAYS
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000

  let content = ''
  try {
    content = await readFile(filePath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0
    throw error
  }

  const kept: string[] = []
  let purged = 0
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue
    try {
      const obs = JSON.parse(line) as StoredSkillObservation
      const ts = Date.parse(obs.timestamp)
      if (!Number.isNaN(ts) && ts < cutoff) {
        purged += 1
        continue
      }
      kept.push(line)
    } catch {
      kept.push(line)
    }
  }

  if (purged === 0) return 0
  // Atomic write: temp + rename. Direct writeFile leaves a truncated/empty
  // file if the process crashes mid-write, losing retained observations.
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`
  await writeFile(tmpPath, kept.length ? `${kept.join('\n')}\n` : '')
  await rename(tmpPath, filePath)
  return purged
}

export async function archiveLargeObservationFile(
  options?: ObservationStoreOptions,
): Promise<string | null> {
  const filePath = getObservationFilePath(options)
  const threshold =
    options?.archiveThresholdBytes ?? DEFAULT_ARCHIVE_THRESHOLD_BYTES

  let currentStat
  try {
    currentStat = await stat(filePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }

  if (currentStat.size < threshold) return null

  const archiveDir = join(dirname(filePath), 'observations.archive')
  await mkdir(archiveDir, { recursive: true })
  const archivePath = join(
    archiveDir,
    `observations-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`,
  )
  await rename(filePath, archivePath)
  return archivePath
}

function observationsFromTranscriptEntry(
  entry: ClaudeTranscriptEntry,
  options?: ObservationStoreOptions,
): StoredSkillObservation[] {
  const project = options?.project
  const base = {
    sessionId: entry.sessionId ?? 'unknown-session',
    projectId: project?.projectId ?? 'global',
    projectName: project?.projectName ?? 'global',
    cwd: entry.cwd ?? project?.cwd ?? process.cwd(),
    timestamp: entry.timestamp ?? new Date().toISOString(),
    source: 'transcript' as const,
  }

  const role = entry.message?.role ?? entry.type
  const content = entry.message?.content
  const observations: StoredSkillObservation[] = []

  if (entry.tool_name) {
    observations.push({
      ...base,
      id: createObservationId(),
      event: 'tool_complete',
      toolName: entry.tool_name,
      toolInput: stringifyField(entry.tool_input),
      toolOutput: stringifyField(entry.tool_response),
      outcome: inferOutcome(entry.tool_response),
    })
  }

  if (role === 'user') {
    const toolResults = extractToolResults(content)
    if (toolResults.length > 0) {
      for (const result of toolResults) {
        observations.push({
          ...base,
          id: createObservationId(),
          event: 'tool_complete',
          toolName: result.name,
          toolOutput: result.output,
          outcome: result.isError ? 'failure' : 'success',
        })
      }
      return observations
    }

    observations.push({
      ...base,
      id: createObservationId(),
      event: 'user_message',
      messageText: extractText(content),
    })
    return observations
  }

  if (role === 'assistant') {
    const toolUses = extractToolUses(content)
    for (const toolUse of toolUses) {
      observations.push({
        ...base,
        id: createObservationId(),
        event: 'tool_start',
        toolName: toolUse.name,
        toolInput: toolUse.input,
      })
    }

    const text = extractText(content)
    if (text.trim()) {
      observations.push({
        ...base,
        id: createObservationId(),
        event: 'assistant_message',
        messageText: text,
      })
    }
  }

  return observations
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return stringifyField(content) ?? ''

  return content
    .map(part => {
      if (typeof part === 'string') return part
      if (!part || typeof part !== 'object') return ''
      const record = part as Record<string, unknown>
      return typeof record.text === 'string' ? record.text : ''
    })
    .filter(Boolean)
    .join('\n')
}

function extractToolUses(
  content: unknown,
): Array<{ name: string; input: string | undefined }> {
  if (!Array.isArray(content)) return []
  return content.flatMap(part => {
    if (!part || typeof part !== 'object') return []
    const record = part as Record<string, unknown>
    if (record.type !== 'tool_use') return []
    return [
      {
        name: String(record.name ?? 'unknown_tool'),
        input: stringifyField(record.input),
      },
    ]
  })
}

function extractToolResults(
  content: unknown,
): Array<{ name: string; output: string | undefined; isError: boolean }> {
  if (!Array.isArray(content)) return []
  return content.flatMap(part => {
    if (!part || typeof part !== 'object') return []
    const record = part as Record<string, unknown>
    if (record.type !== 'tool_result') return []
    return [
      {
        name: String(record.name ?? record.tool_name ?? 'unknown_tool'),
        output: stringifyField(record.content),
        isError: record.is_error === true,
      },
    ]
  })
}

function inferOutcome(value: unknown): ObservationOutcome {
  const text = stringifyField(value)?.toLowerCase() ?? ''
  if (text.includes('interrupted') || text.includes('aborted')) {
    return 'interrupted'
  }
  if (
    text.includes('error') ||
    text.includes('exception') ||
    text.includes('failed')
  ) {
    return 'failure'
  }
  return 'success'
}

export function stringifyField(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

function createObservationId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return randomUUID()
}

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
