import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import { getUploadUrl } from './api.js'
import { UploadMediaType } from './types.js'

export function encryptAesEcb(plaintext: Buffer, key: Buffer): Buffer {
  const cipher = createCipheriv('aes-128-ecb', key, null)
  return Buffer.concat([cipher.update(plaintext), cipher.final()])
}

export function decryptAesEcb(ciphertext: Buffer, key: Buffer): Buffer {
  const decipher = createDecipheriv('aes-128-ecb', key, null)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

export function aesEcbPaddedSize(size: number): number {
  return size + (16 - (size % 16))
}

export function buildCdnDownloadUrl(
  encryptedQueryParam: string,
  cdnBaseUrl: string,
): string {
  return `${cdnBaseUrl}/download?encrypted_query_param=${encodeURIComponent(encryptedQueryParam)}`
}

export function buildCdnUploadUrl(
  cdnBaseUrl: string,
  uploadParam: string,
  filekey: string,
): string {
  return `${cdnBaseUrl}/upload?encrypted_query_param=${encodeURIComponent(uploadParam)}&filekey=${encodeURIComponent(filekey)}`
}

export function parseAesKey(aesKeyBase64: string): Buffer {
  const decoded = Buffer.from(aesKeyBase64, 'base64')
  if (decoded.length === 16) {
    return decoded
  }
  if (decoded.length === 32 && /^[0-9a-fA-F]{32}$/.test(decoded.toString('ascii'))) {
    return Buffer.from(decoded.toString('ascii'), 'hex')
  }
  throw new Error(
    `Invalid aes_key: expected 16 raw bytes or 32 hex chars, got ${decoded.length} bytes`,
  )
}

export async function downloadAndDecrypt(params: {
  encryptQueryParam: string
  aesKey: string
  cdnBaseUrl: string
}): Promise<Buffer> {
  const url = buildCdnDownloadUrl(params.encryptQueryParam, params.cdnBaseUrl)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`CDN download failed: HTTP ${response.status}`)
  }
  const ciphertext = Buffer.from(await response.arrayBuffer())
  return decryptAesEcb(ciphertext, parseAesKey(params.aesKey))
}

export interface UploadedFileInfo {
  encryptQueryParam: string
  aesKey: string
  fileSize: number
  rawSize: number
  fileName: string
}

export async function uploadFile(params: {
  filePath: string
  toUserId: string
  mediaType: number
  apiBaseUrl: string
  token: string
  cdnBaseUrl: string
}): Promise<UploadedFileInfo> {
  const plaintext = readFileSync(params.filePath)
  const rawSize = plaintext.length
  const rawMd5 = createHash('md5').update(plaintext).digest('hex')
  const aesKey = randomBytes(16)
  const filekey = randomBytes(16).toString('hex')
  const ciphertext = encryptAesEcb(plaintext, aesKey)
  const fileSize = ciphertext.length

  const uploadResp = await getUploadUrl(params.apiBaseUrl, params.token, {
    filekey,
    media_type: params.mediaType,
    to_user_id: params.toUserId,
    rawsize: rawSize,
    rawfilemd5: rawMd5,
    filesize: fileSize,
    no_need_thumb: true,
    aeskey: aesKey.toString('hex'),
  })

  if (!uploadResp.upload_param) {
    throw new Error('No upload_param in response')
  }

  const uploadUrl = buildCdnUploadUrl(
    params.cdnBaseUrl,
    uploadResp.upload_param,
    filekey,
  )
  const uploadResult = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: new Uint8Array(ciphertext),
  })

  if (!uploadResult.ok) {
    throw new Error(`CDN upload failed: HTTP ${uploadResult.status}`)
  }

  return {
    encryptQueryParam: uploadResult.headers.get('x-encrypted-param') || '',
    aesKey: Buffer.from(aesKey.toString('hex')).toString('base64'),
    fileSize,
    rawSize,
    fileName: basename(params.filePath),
  }
}

export function guessMediaType(filePath: string): number {
  const ext = extname(filePath).toLowerCase()
  const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.heic']
  const videoExts = ['.mp4', '.mov', '.avi', '.mkv', '.webm']

  if (imageExts.includes(ext)) return UploadMediaType.IMAGE
  if (videoExts.includes(ext)) return UploadMediaType.VIDEO
  return UploadMediaType.FILE
}

export async function downloadRemoteToTemp(
  url: string,
  destDir?: string,
): Promise<string> {
  const dir = destDir || join(tmpdir(), 'weixin-downloads')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const response = await fetch(url)
  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`)

  const buffer = Buffer.from(await response.arrayBuffer())
  const urlPath = new URL(url).pathname
  const name = basename(urlPath) || `file_${Date.now()}`
  const dest = join(dir, name)
  writeFileSync(dest, buffer)
  return dest
}
