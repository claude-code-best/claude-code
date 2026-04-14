import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path'
import { getProjectRoot } from '../bootstrap/state.js'
import { getCwd } from './cwd.js'
import { getFsImplementation } from './fsOperations.js'
import { normalizePathForConfigKey } from './path.js'

export const AUTONOMY_DIR = join('.claude', 'autonomy')
export const AUTONOMY_DIR_POSIX = '.claude/autonomy'
export const AUTONOMY_AGENTS_FILENAME = 'AGENTS.md'
export const AUTONOMY_HEARTBEAT_FILENAME = 'HEARTBEAT.md'
export const AUTONOMY_AGENTS_PATH_POSIX = `${AUTONOMY_DIR_POSIX}/${AUTONOMY_AGENTS_FILENAME}`
export const AUTONOMY_HEARTBEAT_PATH_POSIX = `${AUTONOMY_DIR_POSIX}/${AUTONOMY_HEARTBEAT_FILENAME}`

export type HeartbeatAuthorityTask = {
  name: string
  interval: string
  prompt: string
  steps: HeartbeatAuthorityTaskStep[]
}

export type HeartbeatAuthorityTaskStep = {
  name: string
  prompt: string
  waitFor?: string
}

export type AutonomyAuthorityFile = {
  path: string
  relativePath: string
  content: string
}

export type AutonomyAuthoritySnapshot = {
  rootDir: string
  currentDir: string
  agentsFiles: AutonomyAuthorityFile[]
  agentsContent: string | null
  heartbeatFile: AutonomyAuthorityFile | null
  heartbeatContent: string | null
  heartbeatTasks: HeartbeatAuthorityTask[]
}

type AutonomyAuthorityParams = {
  rootDir?: string
  currentDir?: string
}

export type AutonomyTriggerKind =
  | 'proactive-tick'
  | 'scheduled-task'
  | 'managed-flow-step'

export type PreparedAutonomyTurn = {
  rootDir: string
  currentDir: string
  trigger: AutonomyTriggerKind
  prompt: string
  dueHeartbeatTasks: HeartbeatAuthorityTask[]
  nowMs: number
}

const heartbeatTaskLastRunByKey = new Map<string, number>()

function isPathWithinRoot(rootDir: string, currentDir: string): boolean {
  const delta = relative(rootDir, currentDir)
  return delta === '' || (!delta.startsWith('..') && !isAbsolute(delta))
}

function listAuthorityDirectories(
  rootDir: string,
  currentDir: string,
): string[] {
  const resolvedRoot = resolve(rootDir)
  const resolvedCurrent = resolve(currentDir)
  if (!isPathWithinRoot(resolvedRoot, resolvedCurrent)) {
    return [resolvedRoot]
  }

  const dirs: string[] = []
  let cursor = resolvedCurrent
  for (;;) {
    dirs.push(cursor)
    if (cursor === resolvedRoot) {
      break
    }
    const parent = dirname(cursor)
    if (parent === cursor) {
      break
    }
    cursor = parent
  }
  return dirs.reverse()
}

async function readAuthorityFile(
  filePath: string,
  rootDir: string,
): Promise<AutonomyAuthorityFile | null> {
  try {
    const content = (await getFsImplementation().readFile(filePath, {
      encoding: 'utf-8',
    })) as string
    const trimmed = content.trim()
    if (!trimmed) {
      return null
    }
    return {
      path: filePath,
      relativePath:
        normalizePathForConfigKey(relative(rootDir, filePath)) ||
        basename(filePath),
      content: trimmed,
    }
  } catch {
    return null
  }
}

function mergeAgentsAuthority(files: AutonomyAuthorityFile[]): string | null {
  if (files.length === 0) {
    return null
  }

  return files
    .map(file => `## ${file.relativePath}\n${file.content}`)
    .join('\n\n')
}

export function parseHeartbeatAuthorityTasks(
  content: string,
): HeartbeatAuthorityTask[] {
  const tasks: HeartbeatAuthorityTask[] = []
  const lines = content.split('\n')
  const getIndent = (line: string): number =>
    line.length - line.trimStart().length
  const parseScalar = (line: string, key: string): string =>
    line
      .replace(key, '')
      .trim()
      .replace(/^["']|["']$/g, '')

  function parseSteps(
    startIndex: number,
    stepsIndent: number,
  ): { steps: HeartbeatAuthorityTaskStep[]; nextIndex: number } {
    const steps: HeartbeatAuthorityTaskStep[] = []
    let index = startIndex

    while (index < lines.length) {
      const line = lines[index]!
      const trimmed = line.trim()
      const indent = getIndent(line)

      if (!trimmed) {
        index += 1
        continue
      }

      if (indent <= stepsIndent) {
        break
      }

      if (!trimmed.startsWith('- name:')) {
        index += 1
        continue
      }

      const stepIndent = indent
      const name = parseScalar(trimmed, '- name:')
      let prompt = ''
      let waitFor: string | undefined
      index += 1

      while (index < lines.length) {
        const nextLine = lines[index]!
        const nextTrimmed = nextLine.trim()
        const nextIndent = getIndent(nextLine)

        if (!nextTrimmed) {
          index += 1
          continue
        }

        if (nextIndent <= stepIndent) {
          break
        }

        if (nextTrimmed.startsWith('prompt:')) {
          prompt = parseScalar(nextTrimmed, 'prompt:')
        } else if (nextTrimmed.startsWith('wait_for:')) {
          waitFor = parseScalar(nextTrimmed, 'wait_for:')
        }

        index += 1
      }

      if (name && prompt) {
        steps.push({
          name,
          prompt,
          ...(waitFor ? { waitFor } : {}),
        })
      }
    }

    return { steps, nextIndex: index }
  }

  const tasksLineIndex = lines.findIndex(line => line.trim() === 'tasks:')
  if (tasksLineIndex === -1) {
    return tasks
  }

  const tasksIndent = getIndent(lines[tasksLineIndex]!)
  let index = tasksLineIndex + 1

  while (index < lines.length) {
    const line = lines[index]!
    const trimmed = line.trim()
    const indent = getIndent(line)

    if (!trimmed) {
      index += 1
      continue
    }

    if (indent <= tasksIndent) {
      break
    }

    if (!trimmed.startsWith('- name:')) {
      index += 1
      continue
    }

    const taskIndent = indent
    const name = parseScalar(trimmed, '- name:')
    let interval = ''
    let prompt = ''
    let steps: HeartbeatAuthorityTaskStep[] = []
    index += 1

    while (index < lines.length) {
      const nextLine = lines[index]!
      const nextTrimmed = nextLine.trim()
      const nextIndent = getIndent(nextLine)

      if (!nextTrimmed) {
        index += 1
        continue
      }

      if (nextIndent <= tasksIndent) {
        break
      }

      if (nextIndent === taskIndent && nextTrimmed.startsWith('- name:')) {
        break
      }

      if (nextIndent <= taskIndent) {
        break
      }

      if (nextTrimmed.startsWith('interval:')) {
        interval = parseScalar(nextTrimmed, 'interval:')
        index += 1
        continue
      }

      if (nextTrimmed.startsWith('prompt:')) {
        prompt = parseScalar(nextTrimmed, 'prompt:')
        index += 1
        continue
      }

      if (nextTrimmed === 'steps:') {
        const parsed = parseSteps(index + 1, nextIndent)
        steps = parsed.steps
        index = parsed.nextIndex
        continue
      }

      index += 1
    }

    if (name && interval && prompt) {
      tasks.push({
        name,
        interval,
        prompt,
        steps,
      })
    }
  }

  return tasks
}

function parseHeartbeatIntervalMs(interval: string): number | null {
  const match = interval.trim().match(/^(\d+)\s*(ms|s|m|h|d)?$/i)
  if (!match) {
    return null
  }

  const value = Number.parseInt(match[1]!, 10)
  const unit = (match[2] ?? 'm').toLowerCase()
  switch (unit) {
    case 'ms':
      return value
    case 's':
      return value * 1_000
    case 'm':
      return value * 60_000
    case 'h':
      return value * 60 * 60_000
    case 'd':
      return value * 24 * 60 * 60_000
    default:
      return null
  }
}

function heartbeatTaskKey(
  rootDir: string,
  task: HeartbeatAuthorityTask,
): string {
  return `${rootDir}::${task.name}::${task.interval}::${task.prompt}`
}

function collectDueHeartbeatTasks(
  snapshot: AutonomyAuthoritySnapshot,
  nowMs: number,
): HeartbeatAuthorityTask[] {
  const due: HeartbeatAuthorityTask[] = []
  for (const task of snapshot.heartbeatTasks) {
    const intervalMs = parseHeartbeatIntervalMs(task.interval)
    if (intervalMs == null) {
      continue
    }
    const key = heartbeatTaskKey(snapshot.rootDir, task)
    const lastRunMs = heartbeatTaskLastRunByKey.get(key)
    if (lastRunMs !== undefined && nowMs - lastRunMs < intervalMs) {
      continue
    }
    due.push(task)
  }
  return due
}

function markHeartbeatTasksConsumed(
  snapshot: AutonomyAuthoritySnapshot,
  tasks: HeartbeatAuthorityTask[],
  nowMs: number,
): void {
  for (const task of tasks) {
    heartbeatTaskLastRunByKey.set(
      heartbeatTaskKey(snapshot.rootDir, task),
      nowMs,
    )
  }
}

export function resetAutonomyAuthorityForTests(): void {
  heartbeatTaskLastRunByKey.clear()
}

export async function loadAutonomyAuthority(
  params: AutonomyAuthorityParams = {},
): Promise<AutonomyAuthoritySnapshot> {
  const rootDir = resolve(params.rootDir ?? getProjectRoot())
  const currentDir = resolve(params.currentDir ?? getCwd())
  const authorityDirs = listAuthorityDirectories(rootDir, currentDir)

  const [agentsResults, heartbeatFile] = await Promise.all([
    Promise.all(
      authorityDirs.map(async dir =>
        readAuthorityFile(
          join(dir, AUTONOMY_DIR, AUTONOMY_AGENTS_FILENAME),
          rootDir,
        ),
      ),
    ),
    readAuthorityFile(
      join(rootDir, AUTONOMY_DIR, AUTONOMY_HEARTBEAT_FILENAME),
      rootDir,
    ),
  ])
  const agentsFiles = agentsResults.filter(
    (file): file is AutonomyAuthorityFile => file !== null,
  )

  return {
    rootDir,
    currentDir,
    agentsFiles,
    agentsContent: mergeAgentsAuthority(agentsFiles),
    heartbeatFile,
    heartbeatContent: heartbeatFile?.content ?? null,
    heartbeatTasks: heartbeatFile
      ? parseHeartbeatAuthorityTasks(heartbeatFile.content)
      : [],
  }
}

export async function buildAutonomyTurnPrompt(params: {
  basePrompt: string
  trigger: AutonomyTriggerKind
  rootDir?: string
  currentDir?: string
  nowMs?: number
}): Promise<string> {
  const prepared = await prepareAutonomyTurnPrompt(params)
  commitPreparedAutonomyTurn(prepared)
  return prepared.prompt
}

export async function prepareAutonomyTurnPrompt(params: {
  basePrompt: string
  trigger: AutonomyTriggerKind
  rootDir?: string
  currentDir?: string
  nowMs?: number
}): Promise<PreparedAutonomyTurn> {
  const snapshot = await loadAutonomyAuthority({
    rootDir: params.rootDir,
    currentDir: params.currentDir,
  })
  const nowMs = params.nowMs ?? Date.now()
  const dueHeartbeatTasks =
    params.trigger === 'proactive-tick'
      ? collectDueHeartbeatTasks(snapshot, nowMs)
      : []
  const duePromptTasks = dueHeartbeatTasks.filter(
    task => task.steps.length === 0,
  )

  const sections: string[] = []
  if (snapshot.agentsContent) {
    sections.push(
      `Workspace authority from ${AUTONOMY_AGENTS_FILENAME}:\n${snapshot.agentsContent}`,
    )
  }
  if (snapshot.heartbeatContent) {
    sections.push(
      `Workspace heartbeat guidance from ${AUTONOMY_HEARTBEAT_FILENAME}:\n${snapshot.heartbeatContent}`,
    )
  }
  if (duePromptTasks.length > 0) {
    sections.push(
      [
        `Due ${AUTONOMY_HEARTBEAT_FILENAME} tasks:`,
        ...duePromptTasks.map(
          task => `- ${task.name} (${task.interval}): ${task.prompt}`,
        ),
      ].join('\n'),
    )
  }

  if (sections.length === 0) {
    return {
      rootDir: snapshot.rootDir,
      currentDir: snapshot.currentDir,
      trigger: params.trigger,
      prompt: params.basePrompt,
      dueHeartbeatTasks,
      nowMs,
    }
  }

  const prelude =
    params.trigger === 'proactive-tick'
      ? 'This is an autonomous proactive turn. Follow the workspace authority below before acting.'
      : 'This prompt was generated automatically. Follow the workspace authority below before acting.'

  return {
    rootDir: snapshot.rootDir,
    currentDir: snapshot.currentDir,
    trigger: params.trigger,
    prompt: [
      prelude,
      '<autonomy_authority>',
      ...sections,
      '</autonomy_authority>',
      params.basePrompt,
    ].join('\n\n'),
    dueHeartbeatTasks,
    nowMs,
  }
}

export function commitPreparedAutonomyTurn(
  prepared: PreparedAutonomyTurn,
): void {
  if (
    prepared.trigger !== 'proactive-tick' ||
    prepared.dueHeartbeatTasks.length === 0
  ) {
    return
  }
  const snapshot: AutonomyAuthoritySnapshot = {
    rootDir: prepared.rootDir,
    currentDir: prepared.currentDir,
    agentsFiles: [],
    agentsContent: null,
    heartbeatFile: null,
    heartbeatContent: null,
    heartbeatTasks: prepared.dueHeartbeatTasks,
  }
  markHeartbeatTasksConsumed(
    snapshot,
    prepared.dueHeartbeatTasks,
    prepared.nowMs,
  )
}
