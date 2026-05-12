import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
// Matches the canonical definition in src/services/mcp/channelPermissions.ts
const PERMISSION_REPLY_RE = /^\s*(y|yes|n|no)\s+([a-km-z]{5})\s*$/i
import { getUpdates } from './api.js'
import { getStateDir } from './accounts.js'
import { downloadAndDecrypt } from './media.js'
import { addPendingPairing, isAllowed } from './pairing.js'
import {
  consumePendingPermission,
  setActivePermissionChat,
} from './permissions.js'
import { sendText } from './send.js'
import {
  MessageItemType,
  MessageType,
  type MessageItem,
  type WeixinMessage,
} from './types.js'

const contextTokens = new Map<string, string>()

export function getContextToken(userId: string): string | undefined {
  return contextTokens.get(userId)
}

function cursorPath(): string {
  return join(getStateDir(), 'cursor.txt')
}

function loadCursor(): string {
  const path = cursorPath()
  if (existsSync(path)) return readFileSync(path, 'utf-8').trim()
  return ''
}

function saveCursor(cursor: string): void {
  writeFileSync(cursorPath(), cursor, 'utf-8')
}

async function downloadMedia(
  item: MessageItem,
  cdnBaseUrl: string,
): Promise<{ path: string; type: string } | null> {
  let encryptQueryParam: string | undefined
  let aesKey: string | undefined
  let ext = ''
  let mediaType = ''

  switch (item.type) {
    case MessageItemType.IMAGE:
      encryptQueryParam = item.image_item?.media?.encrypt_query_param
      aesKey = item.image_item?.aeskey
        ? Buffer.from(item.image_item.aeskey, 'hex').toString('base64')
        : item.image_item?.media?.aes_key
      ext = '.jpg'
      mediaType = 'image'
      break
    case MessageItemType.VOICE:
      encryptQueryParam = item.voice_item?.media?.encrypt_query_param
      aesKey = item.voice_item?.media?.aes_key
      ext = '.silk'
      mediaType = 'voice'
      break
    case MessageItemType.FILE:
      encryptQueryParam = item.file_item?.media?.encrypt_query_param
      aesKey = item.file_item?.media?.aes_key
      ext = item.file_item?.file_name
        ? `.${item.file_item.file_name.split('.').pop()}`
        : ''
      mediaType = 'file'
      break
    case MessageItemType.VIDEO:
      encryptQueryParam = item.video_item?.media?.encrypt_query_param
      aesKey = item.video_item?.media?.aes_key
      ext = '.mp4'
      mediaType = 'video'
      break
    default:
      return null
  }

  if (!encryptQueryParam || !aesKey) return null

  try {
    const data = await downloadAndDecrypt({
      encryptQueryParam,
      aesKey,
      cdnBaseUrl,
    })
    const dir = join(tmpdir(), 'weixin-media')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const rawFileName = item.file_item?.file_name || `${Date.now()}${ext}`
    const fileName = basename(rawFileName)
    const filePath = join(dir, fileName)
    writeFileSync(filePath, data)
    return { path: filePath, type: mediaType }
  } catch (error) {
    process.stderr.write(`[weixin] Failed to download media: ${error}\n`)
    return null
  }
}

export interface ParsedMessage {
  fromUserId: string
  messageId: string
  text: string
  attachmentPath?: string
  attachmentType?: string
}

export type OnMessageCallback = (msg: ParsedMessage) => Promise<void>

export type PermissionResponse = {
  requestId: string
  behavior: 'allow' | 'deny'
  fromUserId: string
}

export type OnPermissionResponseCallback = (
  response: PermissionResponse,
) => Promise<void>

export function extractPermissionReply(
  text: string,
): { requestId: string; behavior: 'allow' | 'deny' } | null {
  const match = text.match(PERMISSION_REPLY_RE)
  if (!match) return null
  const behavior = match[1]?.toLowerCase().startsWith('y') ? 'allow' : 'deny'
  const requestId = match[2]?.toLowerCase()
  if (!requestId) return null
  return { requestId, behavior }
}

export async function startPollLoop(params: {
  baseUrl: string
  cdnBaseUrl: string
  token: string
  onMessage: OnMessageCallback
  onPermissionResponse?: OnPermissionResponseCallback
  abortSignal: AbortSignal
}): Promise<void> {
  const {
    baseUrl,
    cdnBaseUrl,
    token,
    onMessage,
    onPermissionResponse,
    abortSignal,
  } = params
  let cursor = loadCursor()
  let consecutiveErrors = 0

  process.stderr.write('[weixin] Starting message poll loop...\n')

  while (!abortSignal.aborted) {
    try {
      const response = await getUpdates(baseUrl, token, cursor, abortSignal)

      if (response.errcode === -14) {
        process.stderr.write(
          '[weixin] Session expired (errcode -14). Pausing for 30s...\n',
        )
        await new Promise(resolve => setTimeout(resolve, 30_000))
        continue
      }

      if (response.ret !== 0 && response.ret !== undefined) {
        throw new Error(
          `getUpdates error: ret=${response.ret} errcode=${response.errcode} ${response.errmsg}`,
        )
      }

      consecutiveErrors = 0

      if (response.get_updates_buf) {
        cursor = response.get_updates_buf
        saveCursor(cursor)
      }

      if (response.msgs && response.msgs.length > 0) {
        for (const msg of response.msgs) {
          await processMessage(msg, {
            baseUrl,
            cdnBaseUrl,
            token,
            onMessage,
            onPermissionResponse,
          })
        }
      }
    } catch (error) {
      if (abortSignal.aborted) break

      consecutiveErrors += 1
      process.stderr.write(
        `[weixin] Poll error (${consecutiveErrors}): ${error instanceof Error ? error.message : String(error)}\n`,
      )

      if (consecutiveErrors >= 3) {
        process.stderr.write(
          '[weixin] Too many consecutive errors, backing off 30s...\n',
        )
        await new Promise(resolve => setTimeout(resolve, 30_000))
        consecutiveErrors = 0
      } else {
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }
  }

  process.stderr.write('[weixin] Poll loop stopped.\n')
}

async function processMessage(
  msg: WeixinMessage,
  ctx: {
    baseUrl: string
    cdnBaseUrl: string
    token: string
    onMessage: OnMessageCallback
    onPermissionResponse?: OnPermissionResponseCallback
  },
): Promise<void> {
  if (msg.message_type !== MessageType.USER) return
  const fromUserId = msg.from_user_id
  if (!fromUserId) return

  if (msg.context_token) {
    contextTokens.set(fromUserId, msg.context_token)
  }

  if (!isAllowed(fromUserId)) {
    const code = addPendingPairing(fromUserId)
    try {
      await sendText({
        to: fromUserId,
        text: `Your pairing code is: ${code}\n\nAsk the operator to confirm:\nccb weixin access pair ${code}`,
        baseUrl: ctx.baseUrl,
        token: ctx.token,
        contextToken: msg.context_token || '',
      })
    } catch (error) {
      process.stderr.write(`[weixin] Failed to send pairing code: ${error}\n`)
    }
    return
  }

  setActivePermissionChat(fromUserId, msg.context_token)

  let textContent = ''
  let mediaPath: string | undefined
  let mediaType: string | undefined

  if (msg.item_list) {
    for (const item of msg.item_list) {
      if (item.type === MessageItemType.TEXT && item.text_item?.text) {
        textContent += `${textContent ? '\n' : ''}${item.text_item.text}`
      } else if (
        item.type === MessageItemType.IMAGE ||
        item.type === MessageItemType.VOICE ||
        item.type === MessageItemType.FILE ||
        item.type === MessageItemType.VIDEO
      ) {
        const downloaded = await downloadMedia(item, ctx.cdnBaseUrl)
        if (downloaded) {
          mediaPath = downloaded.path
          mediaType = downloaded.type
        }
        if (item.type === MessageItemType.VOICE && item.voice_item?.text) {
          textContent += `${textContent ? '\n' : ''}[Voice transcription]: ${item.voice_item.text}`
        }
      }
    }
  }

  if (!textContent && !mediaPath) return

  if (textContent && ctx.onPermissionResponse) {
    const permissionReply = extractPermissionReply(textContent)
    if (permissionReply) {
      const pending = consumePendingPermission(
        permissionReply.requestId,
        fromUserId,
      )
      if (pending) {
        await ctx.onPermissionResponse({
          requestId: pending.request_id,
          behavior: permissionReply.behavior,
          fromUserId,
        })
        return
      }
    }
  }

  await ctx.onMessage({
    fromUserId,
    messageId: String(msg.message_id || ''),
    text: textContent || '(media attachment)',
    attachmentPath: mediaPath,
    attachmentType: mediaType,
  })
}
