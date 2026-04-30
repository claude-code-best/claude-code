import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'

export interface JobState {
  jobId: string
  templateName: string
  createdAt: string
  updatedAt: string
  status: 'created' | 'running' | 'completed' | 'failed'
  args: string[]
}

function getJobsDir(): string {
  return join(getClaudeConfigHomeDir(), 'jobs')
}

export function getJobDir(jobId: string): string {
  return join(getJobsDir(), jobId)
}

/**
 * Create a new job directory with initial state.
 */
export function createJob(
  jobId: string,
  templateName: string,
  templateContent: string,
  inputText: string,
  args: string[],
): string {
  const dir = getJobDir(jobId)
  mkdirSync(dir, { recursive: true })

  const now = new Date().toISOString()
  const state: JobState = {
    jobId,
    templateName,
    createdAt: now,
    updatedAt: now,
    status: 'created',
    args,
  }

  writeFileSync(
    join(dir, 'state.json'),
    JSON.stringify(state, null, 2),
    'utf-8',
  )
  writeFileSync(join(dir, 'template.md'), templateContent, 'utf-8')
  writeFileSync(join(dir, 'input.txt'), inputText, 'utf-8')

  return dir
}

/**
 * Read job state from disk.
 */
export function readJobState(jobId: string): JobState | null {
  try {
    const raw = readFileSync(join(getJobDir(jobId), 'state.json'), 'utf-8')
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const obj = parsed as Record<string, unknown>
    if (typeof obj.jobId !== 'string' || typeof obj.status !== 'string') {
      return null
    }
    return obj as unknown as JobState
  } catch {
    return null
  }
}

/**
 * Append a reply to a job.
 */
export function appendJobReply(jobId: string, text: string): boolean {
  const dir = getJobDir(jobId)
  const state = readJobState(jobId)
  if (!state) return false

  const repliesPath = join(dir, 'replies.jsonl')
  const entry = JSON.stringify({
    text,
    timestamp: new Date().toISOString(),
  })

  try {
    appendFileSync(repliesPath, entry + '\n', 'utf-8')
  } catch {
    writeFileSync(repliesPath, entry + '\n', 'utf-8')
  }

  const updated = { ...state, updatedAt: new Date().toISOString() }
  writeFileSync(
    join(dir, 'state.json'),
    JSON.stringify(updated, null, 2),
    'utf-8',
  )

  return true
}
