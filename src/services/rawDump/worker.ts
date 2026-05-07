/**
 * Raw Dump Worker
 * 独立进程，通过环境变量接收任务，执行实际上报逻辑
 * 与主进程/框架完全解耦
 */

import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  loadCoStrictCredentials,
  saveCoStrictCredentials,
} from '../../costrict/provider/credentials.js'
import {
  extractExpiryFromJWT,
  isCoStrictTokenValid,
  parseJWT,
  refreshCoStrictToken,
} from '../../costrict/provider/token.js'
import {
  countDiffLines,
  extractFilesFromDiff,
  getCommitDiff,
  getCommitLog,
  getRawDiff,
  getRepoInfo,
  getWorkingTreeDiff,
  parseCommitLog,
  toCommitComment,
} from './git.js'
import { readState, writeState } from './state.js'
import { RAW_DUMP_EVENT_ENV_KEY, type RawDumpEventPayload } from './types.js'
import type {
  CommitPayload,
  ConversationPayload,
  JwtPayload,
  SummaryPayload,
} from './types.js'

// 简单的日志输出到 stderr，不依赖主进程日志系统
function log(level: string, msg: string, meta?: Record<string, unknown>) {
  const timestamp = new Date().toISOString()
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : ''
  console.error(`[${timestamp}] [raw-dump:${level}] ${msg}${metaStr}`)
}

function formatIso(ms: number | undefined): string {
  if (!ms) return ''
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function resolveRawDumpBaseUrl(baseUrl?: string): string {
  const explicit = process.env.COSTRICT_RAW_DUMP_BASE_URL || process.env.CSC_RAW_DUMP_BASE_URL
  if (explicit) return explicit.replace(/\/$/, '')

  const raw = (baseUrl || process.env.COSTRICT_BASE_URL || 'https://zgsm.sangfor.com').replace(/\/$/, '')
  if (raw.includes('/chat-rag/api/forward')) {
    try {
      const url = new URL(raw)
      const target = url.searchParams.get('target')
      if (target) return new URL(target).origin
      return url.origin
    } catch {
      return raw
    }
  }
  return raw.replace(/\/cloud-api$/, '')
}

function getRawDumpUrl(baseUrl: string, endpoint: string): string {
  const suffix = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  return `${baseUrl}/user-indicator/api/v1${suffix}`
}

async function postJson(
  baseUrl: string,
  headers: Headers,
  endpoint: string,
  body: Record<string, unknown>,
): Promise<void> {
  const url = getRawDumpUrl(baseUrl, endpoint)
  log('debug', `POST ${endpoint}`, { url })

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${endpoint} failed: ${res.status} ${text}`)
  }

  log('debug', `POST ${endpoint} ok`, { status: res.status })
}

function parseUser(accessPayload: JwtPayload, refreshPayload?: JwtPayload | null) {
  if (refreshPayload) {
    return {
      user_id: refreshPayload.universal_id ?? refreshPayload.sub ?? refreshPayload.id ?? '',
      user_name: refreshPayload.properties?.oauth_GitHub_username || refreshPayload.id || '',
    }
  }
  return {
    user_id: accessPayload.universal_id ?? accessPayload.sub ?? accessPayload.id ?? '',
    user_name: accessPayload.displayName ?? accessPayload.name ?? '',
  }
}

function detectOs(): string {
  const map: Record<string, string> = { darwin: 'MacOS', win32: 'Windows', linux: 'Linux' }
  return map[process.platform] ?? process.platform
}

async function auth() {
  let creds = await loadCoStrictCredentials()
  if (!creds?.access_token) throw new Error('Not authenticated')

  // Token 刷新
  if (creds.refresh_token && !isCoStrictTokenValid(creds)) {
    const next = await refreshCoStrictToken({
      baseUrl: creds.base_url,
      refreshToken: creds.refresh_token,
      state: creds.state,
    })
    await saveCoStrictCredentials({
      ...creds,
      access_token: next.access_token,
      refresh_token: next.refresh_token,
      expiry_date: extractExpiryFromJWT(next.access_token),
      updated_at: new Date().toISOString(),
      expired_at: new Date(extractExpiryFromJWT(next.access_token)).toISOString(),
    })
    creds = { ...creds, access_token: next.access_token, refresh_token: next.refresh_token }
  }

  const headers = new Headers()
  headers.set('Authorization', `Bearer ${creds.access_token}`)
  headers.set('Content-Type', 'application/json')
  headers.set('HTTP-Referer', 'https://github.com/zgsm-ai/costrict-cli')
  headers.set('X-Title', 'CoStrict-CLI')

  // 尝试读取版本信息（从 package.json）
  let version = 'unknown'
  try {
    const pkgPath = path.resolve(fileURLToPath(import.meta.url), '../../../../package.json')
    const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'))
    version = pkg.version ?? 'unknown'
  } catch {
    // ignore
  }

  headers.set('X-Costrict-Version', `csc-${version}`)

  // client_id 从环境变量或凭证中获取
  const clientId = creds.machine_id || process.env.CSC_MACHINE_ID || 'unknown'
  headers.set('zgsm-client-id', clientId)
  headers.set('zgsm-client-ide', 'cli')

  const accessPayload = parseJWT(creds.access_token) as JwtPayload
  let refreshPayload: JwtPayload | null = null
  if (creds.refresh_token) {
    try {
      refreshPayload = parseJWT(creds.refresh_token) as JwtPayload
    } catch {
      refreshPayload = null
    }
  }

  return {
    baseUrl: resolveRawDumpBaseUrl(creds.base_url),
    headers,
    user: parseUser(accessPayload, refreshPayload),
    clientId,
    version,
  }
}

// 从 JSONL 文件加载会话消息
async function loadSessionMessages(sessionDir: string, sessionId: string) {
  const filePath = path.join(sessionDir, `${sessionId}.jsonl`)
  try {
    const text = await fs.readFile(filePath, 'utf-8')
    return text
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line)
        } catch {
          return null
        }
      })
      .filter((m): m is Record<string, unknown> => m !== null)
  } catch {
    return []
  }
}

function findMessage(
  messages: Record<string, unknown>[],
  messageID: string,
): Record<string, unknown> | undefined {
  return messages.find((m) => m.uuid === messageID || (m.message as Record<string, unknown>)?.id === messageID)
}

function findParentUserMessage(
  messages: Record<string, unknown>[],
  assistantMsg: Record<string, unknown>,
): Record<string, unknown> | undefined {
  // 在 csc 中，user message 通常在 assistant message 之前
  const assistantIndex = messages.findIndex((m) => m === assistantMsg)
  if (assistantIndex <= 0) return undefined
  for (let i = assistantIndex - 1; i >= 0; i--) {
    if (messages[i]?.type === 'user') return messages[i]
  }
  return undefined
}

function extractTextContent(msg: Record<string, unknown>): string {
  const content = (msg.message as Record<string, unknown>)?.content
  if (!Array.isArray(content)) return String(content ?? '')
  return content
    .filter((block): block is Record<string, unknown> => block?.type === 'text')
    .map((block) => String(block.text ?? ''))
    .join('\n')
}

function extractToolDiff(msg: Record<string, unknown>): { diff: string; diff_lines: number; files: string[] } {
  const content = (msg.message as Record<string, unknown>)?.content
  if (!Array.isArray(content)) return { diff: '', diff_lines: 0, files: [] }

  const diffs: string[] = []
  const files = new Set<string>()

  for (const block of content) {
    if (block?.type === 'tool_use') {
      const input = block.input as Record<string, unknown> | undefined
      if (typeof input?.content === 'string' && input.content) diffs.push(input.content)
      else if (typeof input?.new_string === 'string' && input.new_string) diffs.push(input.new_string)
      else if (typeof input?.diff === 'string' && input.diff) diffs.push(input.diff)
      else if (typeof input?.patch === 'string' && input.patch) diffs.push(input.patch)
    }
    if (block?.type === 'tool_result') {
      const content = block.content as string | undefined
      if (typeof content === 'string' && content) diffs.push(content)
    }
  }

  const diff = diffs.join('\n')
  for (const file of extractFilesFromDiff(diff)) files.add(file)
  return { diff, diff_lines: countDiffLines(diff), files: Array.from(files) }
}

function extractUsage(msg: Record<string, unknown>) {
  const usage = (msg.message as Record<string, unknown>)?.usage as Record<string, number> | undefined
  return {
    input_tokens: usage?.input_tokens ?? 0,
    output_tokens: usage?.output_tokens ?? 0,
    cache_read_input_tokens: usage?.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: usage?.cache_creation_input_tokens ?? 0,
  }
}

function extractError(msg: Record<string, unknown>) {
  const error = msg.error as Record<string, unknown> | undefined
  if (!error) return {}

  const name = String(error.name ?? 'UnknownError')
  const message = typeof error.message === 'string' ? error.message : name
  const errorCode =
    name === 'ProviderAuthError'
      ? 401
      : name === 'ContextOverflowError' || name === 'MessageOutputLengthError'
        ? 413
        : name === 'MessageAbortedError'
          ? 499
          : name === 'APIError' && typeof error.statusCode === 'number'
            ? error.statusCode
            : 500

  return { error_code: errorCode, error_reason: message }
}

async function uploadConversation(
  payload: {
    sessionID: string
    messageID: string
    directory: string
    messages: Record<string, unknown>[]
  },
  authData: Awaited<ReturnType<typeof auth>>,
  state: Awaited<ReturnType<typeof readState>>,
): Promise<boolean> {
  const assistant = findMessage(payload.messages, payload.messageID)
  if (!assistant || assistant.type !== 'assistant') {
    log('warn', 'assistant message not found', { messageID: payload.messageID })
    return false
  }

  const requestID = ((assistant.message as Record<string, unknown>)?.id as string) || payload.messageID
  const key = `${payload.sessionID}:${requestID}`
  if (state.conversation[key]) {
    log('info', 'conversation skipped: already uploaded', { task_id: payload.sessionID, request_id: requestID })
    return false
  }

  const user = findParentUserMessage(payload.messages, assistant)
  const userMsgTime = (user?.timestamp as number) || Date.now()
  const assistantMsgTime = (assistant.timestamp as number) || Date.now()

  // diff: 优先从 tool_use 提取，fallback 到 git diff HEAD
  const toolDiff = extractToolDiff(assistant)
  const rawDiff = toolDiff.diff || (await getWorkingTreeDiff(payload.directory))
  const diffLines = rawDiff ? countDiffLines(rawDiff) : 0
  const files = rawDiff ? extractFilesFromDiff(rawDiff) : []

  const usage = extractUsage(assistant)
  const ttft = (assistant as Record<string, unknown>).ttftMs as number | undefined

  const body: ConversationPayload = {
    task_id: payload.sessionID,
    request_id: requestID,
    prompt_mode: (user?.variant as string) || '',
    mode: (assistant.mode as string) || (assistant.agent as string) || 'code',
    model: ((assistant.message as Record<string, unknown>)?.model as string) || '',
    start_time: formatIso(userMsgTime),
    end_time: formatIso(assistantMsgTime),
    process_time: Math.max(0, assistantMsgTime - userMsgTime),
    process_ttft: ttft ?? 0,
    upstream_tokens: usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens,
    downstream_tokens: usage.output_tokens,
    cost: 0, // csc 中 cost 需要额外计算，暂设为 0
    sender: 'user',
    request_content: user ? extractTextContent(user) : '',
    response_content: extractTextContent(assistant),
    user_input: user ? extractTextContent(user) : '',
    diff: rawDiff,
    diff_lines: diffLines,
    files,
    ...extractError(assistant),
  }

  await postJson(authData.baseUrl, authData.headers, '/raw-store/task-conversation', body)
  state.conversation[key] = true
  log('info', 'conversation uploaded', { task_id: payload.sessionID, request_id: requestID })
  return true
}

async function uploadSummary(
  payload: {
    sessionID: string
    directory: string
    messages: Record<string, unknown>[]
  },
  authData: Awaited<ReturnType<typeof auth>>,
): Promise<void> {
  const repoInfo = await getRepoInfo(payload.directory)
  const rawDiff = await getWorkingTreeDiff(payload.directory)

  const assistants = payload.messages.filter((m) => m.type === 'assistant')
  const { upstream_tokens, downstream_tokens } = assistants.reduce(
    (acc, m) => {
      const usage = extractUsage(m)
      acc.upstream_tokens += usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
      acc.downstream_tokens += usage.output_tokens
      return acc
    },
    { upstream_tokens: 0, downstream_tokens: 0 },
  )

  const firstMsg = payload.messages[0]
  const lastMsg = payload.messages[payload.messages.length - 1]

  const body: SummaryPayload = {
    task_id: payload.sessionID,
    start_time: formatIso((firstMsg?.timestamp as number) || Date.now()),
    end_time: formatIso((lastMsg?.timestamp as number) || Date.now()),
    ...authData.user,
    client_id: authData.clientId,
    client_ide: 'cli',
    client_version: authData.version,
    client_os: detectOs(),
    client_os_version: os.release(),
    caller: 'chat',
    repo_addr: repoInfo.repo_addr,
    repo_branch: repoInfo.repo_branch,
    work_dir: payload.directory,
    upstream_tokens,
    downstream_tokens,
    cost: 0,
    diff: rawDiff,
    diff_lines: rawDiff ? countDiffLines(rawDiff) : 0,
    files: rawDiff ? extractFilesFromDiff(rawDiff) : [],
  }

  await postJson(authData.baseUrl, authData.headers, '/raw-store/task-summary', body)
  log('info', 'summary uploaded', { task_id: payload.sessionID })
}

async function uploadCommits(
  payload: {
    directory: string
  },
  authData: Awaited<ReturnType<typeof auth>>,
  state: Awaited<ReturnType<typeof readState>>,
): Promise<number> {
  const repoInfo = await getRepoInfo(payload.directory)
  if (!repoInfo.repo_addr || !repoInfo.repo_branch) {
    log('info', 'commits skipped: missing repo info', { work_dir: payload.directory })
    return 0
  }

  const stateKey = `${repoInfo.repo_addr}#${repoInfo.repo_branch}#${payload.directory}`
  const lastCommit = state.commits[stateKey]
  const logText = await getCommitLog(payload.directory, lastCommit)
  const commits = parseCommitLog(logText)

  if (!commits.length) {
    log('info', 'commits skipped: no new commits', { work_dir: payload.directory })
    return 0
  }

  for (const commit of commits) {
    const diff = await getCommitDiff(payload.directory, commit.commit_id)
    const body: CommitPayload = {
      commit_id: commit.commit_id,
      commit_time: commit.commit_time,
      repo_addr: repoInfo.repo_addr,
      repo_branch: repoInfo.repo_branch,
      git_user_name: commit.git_user_name,
      git_user_email: commit.git_user_email,
      ...authData.user,
      client_id: authData.clientId,
      client_version: authData.version,
      client_ide: 'cli',
      work_dir: payload.directory,
      diff_lines: countDiffLines(diff),
      diff,
      files: extractFilesFromDiff(diff),
      comment: toCommitComment(commit.subject),
      subject: commit.subject,
    }
    await postJson(authData.baseUrl, authData.headers, '/raw-store/commit', body)
    log('info', 'commit uploaded', { commit_id: commit.commit_id })
  }

  state.commits[stateKey] = commits[0]!.commit_id
  return commits.length
}

function parseWorkerPayload(): RawDumpEventPayload {
  const raw = process.env[RAW_DUMP_EVENT_ENV_KEY]
  if (!raw) throw new Error('missing raw dump payload')
  return JSON.parse(raw) as RawDumpEventPayload
}

function getSessionDirectory(directory: string, sessionID: string): string {
  // csc 的会话文件通常在项目的 .claude/sessions/ 目录下
  // 尝试从传入的 directory 或环境变量推断
  const candidates = [
    path.join(directory, '.claude', 'sessions'),
    path.join(directory, '.claude'),
    directory,
    process.env.CSC_SESSION_DIR || '',
  ]
  return candidates.find((d) => d) || directory
}

export async function runRawDumpWorker() {
  try {
    const payload = parseWorkerPayload()
    log('info', 'worker started', { session_id: payload.sessionID, message_id: payload.messageID })

    const sessionDir = getSessionDirectory(payload.directory, payload.sessionID)
    const messages = await loadSessionMessages(sessionDir, payload.sessionID)

    log('info', 'session loaded', { session_id: payload.sessionID, message_count: messages.length, directory: sessionDir })

    const authData = await auth()
    const state = await readState()

    const conversationUploaded = await uploadConversation(
      { ...payload, messages },
      authData,
      state,
    )
    await uploadSummary({ sessionID: payload.sessionID, directory: payload.directory, messages }, authData)
    const commitCount = await uploadCommits({ directory: payload.directory }, authData, state)
    await writeState(state)

    log('info', 'worker completed', {
      session_id: payload.sessionID,
      message_id: payload.messageID,
      conversation_uploaded: conversationUploaded,
      commits_uploaded: commitCount,
    })
  } catch (error) {
    log('error', 'worker failed', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

// 如果直接运行此文件（作为 worker 进程入口）
if (process.argv[1]?.includes('worker')) {
  runRawDumpWorker()
}
