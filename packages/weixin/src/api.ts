import { randomBytes } from 'node:crypto'
import type {
  BaseInfo,
  GetConfigResp,
  GetUpdatesReq,
  GetUpdatesResp,
  GetUploadUrlReq,
  GetUploadUrlResp,
  SendMessageReq,
  SendTypingReq,
  SendTypingResp,
} from './types.js'

const CHANNEL_VERSION = '0.1.0'

function baseInfo(): BaseInfo {
  return { channel_version: CHANNEL_VERSION }
}

function randomUin(): string {
  return randomBytes(4).toString('base64')
}

function buildHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-WECHAT-UIN': randomUin(),
  }
  if (token) {
    headers.AuthorizationType = 'ilink_bot_token'
    headers.Authorization = `Bearer ${token}`
  }
  return headers
}

async function post<T>(
  baseUrl: string,
  path: string,
  body: unknown,
  token?: string,
  timeoutMs = 40_000,
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  if (signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: buildHeaders(token),
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    return (await response.json()) as T
  } finally {
    clearTimeout(timeout)
  }
}

export async function getUpdates(
  baseUrl: string,
  token: string,
  getUpdatesBuf: string,
  signal?: AbortSignal,
): Promise<GetUpdatesResp> {
  const body: GetUpdatesReq = {
    get_updates_buf: getUpdatesBuf,
    base_info: baseInfo(),
  }

  try {
    return await post<GetUpdatesResp>(
      baseUrl,
      '/ilink/bot/getupdates',
      body,
      token,
      40_000,
      signal,
    )
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { ret: 0, msgs: [], get_updates_buf: getUpdatesBuf }
    }
    throw error
  }
}

export async function sendMessage(
  baseUrl: string,
  token: string,
  msg: SendMessageReq['msg'],
): Promise<void> {
  const body: SendMessageReq = { msg, base_info: baseInfo() }
  await post(baseUrl, '/ilink/bot/sendmessage', body, token)
}

export async function getUploadUrl(
  baseUrl: string,
  token: string,
  params: Omit<GetUploadUrlReq, 'base_info'>,
): Promise<GetUploadUrlResp> {
  return post<GetUploadUrlResp>(
    baseUrl,
    '/ilink/bot/getuploadurl',
    { ...params, base_info: baseInfo() },
    token,
  )
}

export async function getConfig(
  baseUrl: string,
  token: string,
  userId: string,
  contextToken?: string,
): Promise<GetConfigResp> {
  return post<GetConfigResp>(
    baseUrl,
    '/ilink/bot/getconfig',
    {
      ilink_user_id: userId,
      context_token: contextToken,
      base_info: baseInfo(),
    },
    token,
  )
}

export async function sendTyping(
  baseUrl: string,
  token: string,
  req: Omit<SendTypingReq, 'base_info'>,
): Promise<SendTypingResp> {
  return post<SendTypingResp>(
    baseUrl,
    '/ilink/bot/sendtyping',
    { ...req, base_info: baseInfo() },
    token,
  )
}
