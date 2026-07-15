import type {
  Product,
  Project,
  RemoteDirectoryListing,
  Session,
  Environment,
  ControlRequestEnvelope,
  ControlResponse,
  SessionHistoryResponse,
  ProviderCatalogResponse,
  ProviderMutationPayload,
  ProviderModelMutationPayload,
} from '../types'
import { generateMessageUuid } from '../lib/utils'

const BASE = ''

// =============================================================================
// 单用户模式 — 服务端 RCS_SINGLE_USER=1 时 /health 返回 single_user: true。
// 此时所有请求统一使用固定 UUID：服务端本就不校验归属，固定身份的价值在于
// 让所有设备把会话绑到同一个 owner 上，将来切回多用户隔离时会话不会散落
// 在各设备的随机 UUID 名下。
// =============================================================================

const SINGLE_USER_UUID = 'single-user'
let _singleUserMode = false

export function setSingleUserMode(enabled: boolean): void {
  _singleUserMode = enabled
}

export function isSingleUserMode(): boolean {
  return _singleUserMode
}

/**
 * 探测服务端部署模式。失败时保持多用户默认（浏览器随机 UUID）。
 * 返回是否处于单用户模式，调用方可据此决定是否刷新已有列表。
 */
export async function detectServerMode(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/health`)
    if (!res.ok) return _singleUserMode
    const data = (await res.json()) as { single_user?: unknown }
    setSingleUserMode(data.single_user === true)
  } catch {
    // 探测失败（后端未启动等）— 不改变当前模式
  }
  return _singleUserMode
}

export function getUuid(): string {
  if (_singleUserMode) return SINGLE_USER_UUID
  let uuid = localStorage.getItem('rcs_uuid')
  if (!uuid) {
    uuid = generateMessageUuid()
    localStorage.setItem('rcs_uuid', uuid)
  }
  return uuid
}

export function setUuid(uuid: string): void {
  localStorage.setItem('rcs_uuid', uuid)
}

/** Active API token for Authorization header (set by useTokens) */
let _activeToken: string | null = null

export function setActiveApiToken(token: string | null): void {
  _activeToken = token
}

export function getActiveApiToken(): string | null {
  return _activeToken
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function api<T>(
  method: string,
  path: string,
  body?: unknown,
  options?: { signal?: AbortSignal },
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }

  if (_activeToken) {
    headers['Authorization'] = `Bearer ${_activeToken}`
  }

  const uuid = getUuid()
  const sep = path.includes('?') ? '&' : '?'
  const url = `${BASE}${path}${sep}uuid=${encodeURIComponent(uuid)}`
  const opts: RequestInit = { method, headers, signal: options?.signal }
  if (body !== undefined) opts.body = JSON.stringify(body)

  const res = await fetch(url, opts)
  const data = await res.json()
  if (!res.ok) {
    const err = data.error || { type: 'unknown', message: res.statusText }
    throw new ApiError(err.message || err.type, res.status, data)
  }
  return data as T
}

export function apiBind(sessionId: string, signal?: AbortSignal) {
  return api<void>('POST', '/web/bind', { sessionId }, { signal })
}

export function apiFetchSessions(includeArchived = false) {
  return api<Session[]>(
    'GET',
    includeArchived ? '/web/sessions?include_archived=1' : '/web/sessions',
  )
}

export function apiFetchAllSessions() {
  return api<Session[]>('GET', '/web/sessions/all')
}

export function apiFetchSession(id: string, signal?: AbortSignal) {
  return api<Session>('GET', `/web/sessions/${id}`, undefined, { signal })
}

export function apiFetchSessionHistory(
  id: string,
  options?: { after?: number; limit?: number; signal?: AbortSignal },
) {
  const query = new URLSearchParams()
  if (options?.after !== undefined) query.set('after', String(options.after))
  if (options?.limit !== undefined) query.set('limit', String(options.limit))
  const suffix = query.size > 0 ? `?${query.toString()}` : ''
  return api<SessionHistoryResponse>(
    'GET',
    `/web/sessions/${id}/history${suffix}`,
    undefined,
    { signal: options?.signal },
  )
}

export function apiFetchEnvironments() {
  return api<Environment[]>('GET', '/web/environments')
}

function segment(value: string): string {
  return encodeURIComponent(value)
}

export function apiFetchProviderCatalog(
  environmentId: string,
  signal?: AbortSignal,
) {
  return api<ProviderCatalogResponse>(
    'GET',
    `/web/environments/${segment(environmentId)}/providers`,
    undefined,
    { signal },
  )
}

type ProviderMutationMeta = {
  expected_revision: number
  operation_id: string
}

export function apiCreateProvider(
  environmentId: string,
  input: ProviderMutationMeta & { provider: ProviderMutationPayload },
) {
  return api<ProviderCatalogResponse>(
    'POST',
    `/web/environments/${segment(environmentId)}/providers`,
    input,
  )
}

export function apiUpdateProvider(
  environmentId: string,
  providerId: string,
  input: ProviderMutationMeta & { provider: ProviderMutationPayload },
) {
  return api<ProviderCatalogResponse>(
    'PATCH',
    `/web/environments/${segment(environmentId)}/providers/${segment(providerId)}`,
    input,
  )
}

export function apiArchiveProvider(
  environmentId: string,
  providerId: string,
  input: ProviderMutationMeta,
) {
  return api<ProviderCatalogResponse>(
    'POST',
    `/web/environments/${segment(environmentId)}/providers/${segment(providerId)}/archive`,
    input,
  )
}

export function apiCreateProviderModel(
  environmentId: string,
  providerId: string,
  input: ProviderMutationMeta & { model: ProviderModelMutationPayload },
) {
  return api<ProviderCatalogResponse>(
    'POST',
    `/web/environments/${segment(environmentId)}/providers/${segment(providerId)}/models`,
    input,
  )
}

export function apiUpdateProviderModel(
  environmentId: string,
  providerId: string,
  modelId: string,
  input: ProviderMutationMeta & { model: ProviderModelMutationPayload },
) {
  return api<ProviderCatalogResponse>(
    'PATCH',
    `/web/environments/${segment(environmentId)}/providers/${segment(providerId)}/models/${segment(modelId)}`,
    input,
  )
}

export function apiArchiveProviderModel(
  environmentId: string,
  providerId: string,
  modelId: string,
  input: ProviderMutationMeta,
) {
  return api<ProviderCatalogResponse>(
    'POST',
    `/web/environments/${segment(environmentId)}/providers/${segment(providerId)}/models/${segment(modelId)}/archive`,
    input,
  )
}

export function apiSetDefaultProviderModel(
  environmentId: string,
  input: ProviderMutationMeta & {
    model: { provider_id: string; model_profile_id: string } | null
    allow_unverified: boolean
  },
) {
  return api<ProviderCatalogResponse>(
    'POST',
    `/web/environments/${segment(environmentId)}/providers/default`,
    input,
  )
}

export function apiValidateProviderModel(
  environmentId: string,
  providerId: string,
  modelId: string,
  input: ProviderMutationMeta,
) {
  return api<ProviderCatalogResponse>(
    'POST',
    `/web/environments/${segment(environmentId)}/providers/${segment(providerId)}/models/${segment(modelId)}/validate`,
    input,
  )
}

export function apiBeginProviderAuth(
  environmentId: string,
  providerId: string,
  input: { operation_id: string; method: string },
) {
  return api<ProviderCatalogResponse>(
    'POST',
    `/web/environments/${segment(environmentId)}/providers/${segment(providerId)}/auth/begin`,
    input,
  )
}

export function apiFetchProviderAuthStatus(
  environmentId: string,
  authOperationId: string,
  signal?: AbortSignal,
) {
  return api<ProviderCatalogResponse>(
    'GET',
    `/web/environments/${segment(environmentId)}/provider-auth/${segment(authOperationId)}`,
    undefined,
    { signal },
  )
}

export function apiSubmitProviderAuthCode(
  environmentId: string,
  authOperationId: string,
  code: string,
) {
  return api<ProviderCatalogResponse>(
    'POST',
    `/web/environments/${segment(environmentId)}/provider-auth/${segment(authOperationId)}/code`,
    { code },
  )
}

export function apiCancelProviderAuth(
  environmentId: string,
  authOperationId: string,
) {
  return api<ProviderCatalogResponse>(
    'POST',
    `/web/environments/${segment(environmentId)}/provider-auth/${segment(authOperationId)}/cancel`,
    {},
  )
}

export function apiRemoveProviderAuth(
  environmentId: string,
  providerId: string,
) {
  return api<ProviderCatalogResponse>(
    'DELETE',
    `/web/environments/${segment(environmentId)}/providers/${segment(providerId)}/auth`,
  )
}

export function apiRefreshProviderAuth(
  environmentId: string,
  providerId: string,
  input: { operation_id: string; action: string },
) {
  return api<ProviderCatalogResponse>(
    'POST',
    `/web/environments/${segment(environmentId)}/providers/${segment(providerId)}/auth/refresh`,
    input,
  )
}

export function apiSendEvent(sessionId: string, body: Record<string, unknown>) {
  return api<void>('POST', `/web/sessions/${sessionId}/events`, body)
}

export function apiSendLiveEvent(
  sessionId: string,
  body: Record<string, unknown>,
) {
  return api<void>('POST', `/web/sessions/${sessionId}/live-events`, body)
}

export function apiSendControl(
  sessionId: string,
  body: ControlResponse | ControlRequestEnvelope,
) {
  return api<void>('POST', `/web/sessions/${sessionId}/control`, body)
}

/**
 * Send an SDK control request (set_model / set_permission_mode /
 * set_max_thinking_tokens …) to the CLI worker. The CLI answers with a
 * control_response event carrying the same request_id — await it via
 * RCSChatAdapter.sendControlRequest, which handles the matching.
 */
export function apiSendControlRequest(
  sessionId: string,
  requestId: string,
  request: { subtype: string; [key: string]: unknown },
) {
  return apiSendControl(sessionId, {
    type: 'control_request',
    request_id: requestId,
    request,
    uuid: requestId,
  })
}

export function apiInterrupt(sessionId: string) {
  return apiSendLiveEvent(sessionId, {
    type: 'interrupt',
    command_id: generateMessageUuid(),
  })
}

export function apiArchiveSession(sessionId: string) {
  return api<{ status: string; result: string }>(
    'POST',
    `/web/sessions/${sessionId}/archive`,
  )
}

export function apiRestoreSession(sessionId: string) {
  return api<{ status: string; result: string }>(
    'POST',
    `/web/sessions/${sessionId}/restore`,
  )
}

export function apiRebindSession(sessionId: string, environmentId: string) {
  return api<{ status: string; result: string }>(
    'POST',
    `/web/sessions/${sessionId}/rebind`,
    { environment_id: environmentId },
  )
}

export function apiDeleteSession(sessionId: string) {
  return api<{ status: string }>('DELETE', `/web/sessions/${sessionId}`)
}

export function apiRenameSession(sessionId: string, title: string) {
  return api<Session>('PATCH', `/web/sessions/${sessionId}`, { title })
}

export function apiCreateSession(body: {
  title?: string
  environment_id?: string
  permission_mode?: string
  directory?: string
}) {
  return api<Session>('POST', '/web/sessions', body)
}

// =============================================================================
// Product-specific Chat / Code APIs
// =============================================================================

export function apiFetchChatProjects() {
  return api<Project[]>('GET', '/web/chat/projects')
}

export function apiCreateChatProject(body: { name: string } | string) {
  return api<Project>(
    'POST',
    '/web/chat/projects',
    typeof body === 'string' ? { name: body } : body,
  )
}

/** Update the prompt for a Chat project (or pass product as the first argument for Code). */
export function apiUpdateProjectPrompt(
  projectId: string,
  prompt: string | { prompt: string },
  product?: Product,
): Promise<Project>
export function apiUpdateProjectPrompt(
  product: Product,
  projectId: string,
  prompt: string,
): Promise<Project>
export function apiUpdateProjectPrompt(
  first: string,
  second: string | { prompt: string },
  third?: string | Product,
) {
  const isProductFirst = first === 'chat' || first === 'code'
  const product: Product = isProductFirst
    ? (first as Product)
    : third === 'code'
      ? 'code'
      : 'chat'
  const projectId = isProductFirst ? (second as string) : first
  const prompt = isProductFirst
    ? { prompt: third as string }
    : typeof second === 'string'
      ? { prompt: second }
      : second
  return api<Project>(
    'PATCH',
    `/web/${product}/projects/${projectId}/prompt`,
    prompt,
  )
}

export function apiFetchChatSessions(includeArchived = false) {
  return api<Session[]>(
    'GET',
    includeArchived
      ? '/web/chat/sessions?include_archived=1'
      : '/web/chat/sessions',
  )
}

export function apiCreateChatSession(body: {
  title?: string
  project_id?: string | null
}) {
  return api<Session>('POST', '/web/chat/sessions', body)
}

export function apiAssignChatSessionProject(
  sessionId: string,
  projectId: string | null,
) {
  return api<Session>('POST', `/web/chat/sessions/${sessionId}/project`, {
    project_id: projectId,
  })
}

export function apiDeleteChatProject(projectId: string) {
  return api<{ cleanupPending: boolean }>(
    'DELETE',
    `/web/chat/projects/${projectId}`,
  )
}

export function apiDeleteChatSession(sessionId: string) {
  return api<{ cleanupPending: boolean }>(
    'DELETE',
    `/web/chat/sessions/${sessionId}`,
  )
}

export function apiFetchCodeProjects(includeArchived = false) {
  return api<Project[]>(
    'GET',
    includeArchived
      ? '/web/code/projects?include_archived=1'
      : '/web/code/projects',
  )
}

export function apiFetchCodeSessions(includeArchived = false) {
  return api<Session[]>(
    'GET',
    includeArchived
      ? '/web/code/sessions?include_archived=1'
      : '/web/code/sessions',
  )
}

export function apiCreateCodeSession(body: {
  environment_id: string
  requested_directory: string
  permission_mode?: string
  title?: string
}) {
  return api<Session>('POST', '/web/code/sessions', body)
}

export function apiListRemoteDirectory(
  environmentId: string,
  path: string,
  signal?: AbortSignal,
) {
  return api<RemoteDirectoryListing>(
    'POST',
    `/web/code/environments/${environmentId}/directory`,
    { path },
    { signal },
  )
}

/** Code project deletion is archive-only; the server exposes this as DELETE. */
export function apiArchiveCodeProject(projectId: string) {
  return api<Project>('DELETE', `/web/code/projects/${projectId}`)
}

export function apiRestoreCodeProject(projectId: string) {
  return api<Project>('POST', `/web/code/projects/${projectId}/restore`)
}
