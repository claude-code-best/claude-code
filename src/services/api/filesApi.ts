/** * 用于管理文件的 Files API 客户端
 *
 * 本模块提供从 Anthropic 公共文件 API 下载和上传文件的功能。
 * 由 Claude Code 代理在会话启动时用于下载文件附件。
 *
 * API 参考：https://docs.anthropic.com/en/api/files-content */

import axios from 'axios'
import { randomUUID } from 'crypto'
import * as fs from 'fs/promises'
import * as path from 'path'
import { count } from '../../utils/array.js'
import { getCwd } from '../../utils/cwd.js'
import { logForDebugging } from '../../utils/debug.js'
import { errorMessage } from '../../utils/errors.js'
import { logError } from '../../utils/log.js'
import { sleep } from '../../utils/sleep.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../analytics/index.js'

// Files API 目前处于测试阶段。oauth-2025-04-20 启用了 Bearer OAuth
// 在公共 API 路由上（auth.py: "oauth_auth" 不在 beta_versions 中 → 404）。
const FILES_API_BETA_HEADER = 'files-api-2025-04-14,oauth-2025-04-20'
const ANTHROPIC_VERSION = '2023-06-01'

// API 基础 URL - 使用环境管理器为相应环境设置的 ANTHROPIC_BASE_URL
// 独立使用时回退到公共 API
function getDefaultApiBaseUrl(): string {
  return (
    process.env.ANTHROPIC_BASE_URL ||
    process.env.CLAUDE_CODE_API_BASE_URL ||
    'https://api.anthropic.com'
  )
}

function logDebugError(message: string): void {
  logForDebugging(`[files-api] ${message}`, { level: 'error' })
}

function logDebug(message: string): void {
  logForDebugging(`[files-api] ${message}`)
}

/** * 从 CLI 参数解析的文件规范
 * 格式：--file=<file_id>:<relative_path> */
export type File = {
  fileId: string
  relativePath: string
}

/** * Files API 客户端的配置 */
export type FilesApiConfig = {
  /** 用于身份验证的 OAuth 令牌（来自会话 JWT） */
  oauthToken: string
  /** API 的基础 URL（默认：https://api.anthropic.com） */
  baseUrl?: string
  /** 用于创建会话特定目录的会话 ID */
  sessionId: string
}

/** * 文件下载操作的结果 */
export type DownloadResult = {
  fileId: string
  path: string
  success: boolean
  error?: string
  bytesWritten?: number
}

const MAX_RETRIES = 3
const BASE_DELAY_MS = 500
const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024 // 500MB

/** * 重试操作的结果类型 - 指示是否继续重试 */
type RetryResult<T> = { done: true; value: T } | { done: false; error?: string }

/** * 使用指数退避重试逻辑执行操作
 *
 * @param operation - 用于日志记录的操作名称
 * @param attemptFn - 每次尝试执行的函数，返回 RetryResult
 * @returns 成功的结果值
 * @throws 如果所有重试都耗尽则抛出错误 */
async function retryWithBackoff<T>(
  operation: string,
  attemptFn: (attempt: number) => Promise<RetryResult<T>>,
): Promise<T> {
  let lastError = ''

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const result = await attemptFn(attempt)

    if (result.done) {
      return result.value
    }

    lastError = (result as any).error || `${operation} 失败`
    logDebug(
      `${operation} 尝试 ${attempt}/${MAX_RETRIES} 失败：${lastError}`,
    )

    if (attempt < MAX_RETRIES) {
      const delayMs = BASE_DELAY_MS * 2 ** (attempt - 1)
      logDebug(`${delayMs} 毫秒后重试 ${operation}...`)
      await sleep(delayMs)
    }
  }

  throw new Error(`${lastError} 在 ${MAX_RETRIES} 次尝试后`)
}

/** * 从 Anthropic 公共文件 API 下载单个文件
 *
 * @param fileId - 文件 ID（例如 "file_011CNha8iCJcU1wXNR6q4V8w"）
 * @param config - Files API 配置
 * @returns 文件内容作为 Buffer */
export async function downloadFile(
  fileId: string,
  config: FilesApiConfig,
): Promise<Buffer> {
  const baseUrl = config.baseUrl || getDefaultApiBaseUrl()
  const url = `${baseUrl}/v1/files/${fileId}/content`

  const headers = {
    Authorization: `Bearer ${config.oauthToken}`,
    'anthropic-version': ANTHROPIC_VERSION,
    'anthropic-beta': FILES_API_BETA_HEADER,
  }

  logDebug(`正在从 ${url} 下载文件 ${fileId}`)

  return retryWithBackoff(`下载文件 ${fileId}`, async () => {
    try {
      const response = await axios.get(url, {
        headers,
        responseType: 'arraybuffer',
        timeout: 60000, // 60 second timeout for large files
        validateStatus: status => status < 500,
      })

      if (response.status === 200) {
        logDebug(`已下载文件 ${fileId}（${response.data.length} 字节）`)
        return { done: true, value: Buffer.from(response.data) }
      }

      // 不可重试的错误 - 立即抛出
      if (response.status === 404) {
        throw new Error(`未找到文件：${fileId}`)
      }
      if (response.status === 401) {
        throw new Error('Authentication failed: invalid or missing API key')
      }
      if (response.status === 403) {
        throw new Error(`访问文件被拒绝：${fileId}`)
      }

      return { done: false, error: `状态 ${response.status}` }
    } catch (error) {
      if (!axios.isAxiosError(error)) {
        throw error
      }
      return { done: false, error: error.message }
    }
  })
}

/** * 规范化相对路径，去除冗余前缀，并在 {basePath}/{session_id}/uploads/ 下构建完整的下载路径。
 * 如果路径无效（例如路径遍历），则返回 null。 */
export function buildDownloadPath(
  basePath: string,
  sessionId: string,
  relativePath: string,
): string | null {
  const normalized = path.normalize(relativePath)
  if (normalized.startsWith('..')) {
    logDebugError(
      `无效的文件路径：${relativePath}。路径不得遍历到工作空间之上`,
    )
    return null
  }

  const uploadsBase = path.join(basePath, sessionId, 'uploads')
  const redundantPrefixes = [
    path.join(basePath, sessionId, 'uploads') + path.sep,
    path.sep + 'uploads' + path.sep,
  ]
  const matchedPrefix = redundantPrefixes.find(p => normalized.startsWith(p))
  const cleanPath = matchedPrefix
    ? normalized.slice(matchedPrefix.length)
    : normalized
  return path.join(uploadsBase, cleanPath)
}

/** * 下载文件并保存到会话特定的工作空间目录
 *
 * @param attachment - 要下载的文件附件
 * @param config - Files API 配置
 * @returns 包含成功/失败状态的下载结果 */
export async function downloadAndSaveFile(
  attachment: File,
  config: FilesApiConfig,
): Promise<DownloadResult> {
  const { fileId, relativePath } = attachment
  const fullPath = buildDownloadPath(getCwd(), config.sessionId, relativePath)

  if (!fullPath) {
    return {
      fileId,
      path: '',
      success: false,
      error: `无效的文件路径：${relativePath}`,
    }
  }

  try {
    // 下载文件内容
    const content = await downloadFile(fileId, config)

    // 确保父目录存在
    const parentDir = path.dirname(fullPath)
    await fs.mkdir(parentDir, { recursive: true })

    // 写入文件
    await fs.writeFile(fullPath, content)

    logDebug(`已将文件 ${fileId} 保存到 ${fullPath} (${content.length} 字节)`)

    return {
      fileId,
      path: fullPath,
      success: true,
      bytesWritten: content.length,
    }
  } catch (error) {
    logDebugError(`下载文件 ${fileId} 失败：${errorMessage(error)}`)
    if (error instanceof Error) {
      logError(error)
    }

    return {
      fileId,
      path: fullPath,
      success: false,
      error: errorMessage(error),
    }
  }
}

// 并行下载的默认并发限制
const DEFAULT_CONCURRENCY = 5

/** * 以有限的并发度执行 Promise
 *
 * @param items - 要处理的项
 * @param fn - 应用于每个项的异步函数
 * @param concurrency - 最大并发操作数
 * @returns 与输入项顺序相同的结果 */
async function parallelWithLimit<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let currentIndex = 0

  async function worker(): Promise<void> {
    while (currentIndex < items.length) {
      const index = currentIndex++
      const item = items[index]
      if (item !== undefined) {
        results[index] = await fn(item, index)
      }
    }
  }

  // 启动工作线程，直至达到并发限制
  const workers: Promise<void>[] = []
  const workerCount = Math.min(concurrency, items.length)
  for (let i = 0; i < workerCount; i++) {
    workers.push(worker())
  }

  await Promise.all(workers)
  return results
}

/** * 并行下载会话的所有文件附件
 *
 * @param attachments - 要下载的文件附件列表
 * @param config - Files API 配置
 * @param concurrency - 最大并发下载数（默认：5）
 * @returns 与输入顺序相同的下载结果数组 */
export async function downloadSessionFiles(
  files: File[],
  config: FilesApiConfig,
  concurrency: number = DEFAULT_CONCURRENCY,
): Promise<DownloadResult[]> {
  if (files.length === 0) {
    return []
  }

  logDebug(
    `正在为会话 ${config.sessionId} 下载 ${files.length} 个文件`,
  )
  const startTime = Date.now()

  // 以并发限制并行下载文件
  const results = await parallelWithLimit(
    files,
    file => downloadAndSaveFile(file, config),
    concurrency,
  )

  const elapsedMs = Date.now() - startTime
  const successCount = count(results, r => r.success)
  logDebug(
    `已在 ${elapsedMs}ms 内下载 ${successCount}/${files.length} 个文件`,
  )

  return results
}

// ============================================================================
// 上传功能（BYOC 模式）
// ============================================================================

/** * 文件上传操作的结果 */
export type UploadResult =
  | {
      path: string
      fileId: string
      size: number
      success: true
    }
  | {
      path: string
      error: string
      success: false
    }

/** * 将单个文件上传到 Files API（BYOC 模式）
 *
 * 在读取文件后执行大小验证，以避免 TOCTOU 竞态条件，即文件大小可能在初始检查和上传之间发生变化。
 *
 * @param filePath - 要上传的文件的绝对路径
 * @param relativePath - 文件的相对路径（在 API 中用作文件名）
 * @param config - Files API 配置
 * @returns 包含成功/失败状态的上传结果 */
export async function uploadFile(
  filePath: string,
  relativePath: string,
  config: FilesApiConfig,
  opts?: { signal?: AbortSignal },
): Promise<UploadResult> {
  const baseUrl = config.baseUrl || getDefaultApiBaseUrl()
  const url = `${baseUrl}/v1/files`

  const headers = {
    Authorization: `Bearer ${config.oauthToken}`,
    'anthropic-version': ANTHROPIC_VERSION,
    'anthropic-beta': FILES_API_BETA_HEADER,
  }

  logDebug(`正在将文件 ${filePath} 上传为 ${relativePath}`)

  // 首先读取文件内容（由于不是网络操作，放在重试循环外）
  let content: Buffer
  try {
    content = await fs.readFile(filePath)
  } catch (error) {
    logEvent('tengu_file_upload_failed', {
      error_type:
        'file_read' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    return {
      path: relativePath,
      error: errorMessage(error),
      success: false,
    }
  }

  const fileSize = content.length

  if (fileSize > MAX_FILE_SIZE_BYTES) {
    logEvent('tengu_file_upload_failed', {
      error_type:
        'file_too_large' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    return {
      path: relativePath,
      error: `文件超过最大大小限制 ${MAX_FILE_SIZE_BYTES} 字节（实际：${fileSize}）`,
      success: false,
    }
  }

  // 使用 crypto.randomUUID 生成边界，以避免在同一毫秒开始上传时发生冲突
  const boundary = `----FormBoundary${randomUUID()}`
  const filename = path.basename(relativePath)

  // 构建 multipart 请求体
  const bodyParts: Buffer[] = []

  // 文件部分
  bodyParts.push(
    Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${filename}"
` +
        `Content-Type: application/octet-stream

`,
    ),
  )
  bodyParts.push(content)
  bodyParts.push(Buffer.from('\r\n'))

  // 用途部分
  bodyParts.push(
    Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="purpose"

` +
        `user_data\r\n`,
    ),
  )

  // 结束边界
  bodyParts.push(Buffer.from(`--${boundary}--\r\n`))

  const body = Buffer.concat(bodyParts)

  try {
    return await retryWithBackoff(`上传文件 ${relativePath}`, async () => {
      try {
        const response = await axios.post(url, body, {
          headers: {
            ...headers,
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': body.length.toString(),
          },
          timeout: 120000, // 2 minute timeout for uploads
          signal: opts?.signal,
          validateStatus: status => status < 500,
        })

        if (response.status === 200 || response.status === 201) {
          const fileId = response.data?.id
          if (!fileId) {
            return {
              done: false,
              error: '上传成功但未返回文件 ID',
            }
          }
          logDebug(`已上传文件 ${filePath} -> ${fileId} (${fileSize} 字节)`)
          return {
            done: true,
            value: {
              path: relativePath,
              fileId,
              size: fileSize,
              success: true as const,
            },
          }
        }

        // 不可重试的错误 - 抛出以退出重试循环
        if (response.status === 401) {
          logEvent('tengu_file_upload_failed', {
            error_type:
              'auth' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          })
          throw new UploadNonRetriableError(
            'Authentication failed: invalid or missing API key',
          )
        }

        if (response.status === 403) {
          logEvent('tengu_file_upload_failed', {
            error_type:
              'forbidden' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          })
          throw new UploadNonRetriableError('上传访问被拒绝')
        }

        if (response.status === 413) {
          logEvent('tengu_file_upload_failed', {
            error_type:
              'size' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          })
          throw new UploadNonRetriableError('文件过大，无法上传')
        }

        return { done: false, error: `状态 ${response.status}` }
      } catch (error) {
        // 不可重试的错误会向上传播
        if (error instanceof UploadNonRetriableError) {
          throw error
        }
        if (axios.isCancel(error)) {
          throw new UploadNonRetriableError('上传已取消')
        }
        // 网络错误是可重试的
        if (axios.isAxiosError(error)) {
          return { done: false, error: error.message }
        }
        throw error
      }
    })
  } catch (error) {
    if (error instanceof UploadNonRetriableError) {
      return {
        path: relativePath,
        error: error.message,
        success: false,
      }
    }
    logEvent('tengu_file_upload_failed', {
      error_type:
        'network' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    return {
      path: relativePath,
      error: errorMessage(error),
      success: false,
    }
  }
}

/** 不可重试上传失败的错误类 */
class UploadNonRetriableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UploadNonRetriableError'
  }
}

/** * 在并发限制下并行上传多个文件（BYOC 模式）
 *
 * @param files - 要上传的文件数组（包含路径和相对路径）
 * @param config - Files API 配置
 * @param concurrency - 最大并发上传数（默认：5）
 * @returns 上传结果数组，顺序与输入一致 */
export async function uploadSessionFiles(
  files: Array<{ path: string; relativePath: string }>,
  config: FilesApiConfig,
  concurrency: number = DEFAULT_CONCURRENCY,
): Promise<UploadResult[]> {
  if (files.length === 0) {
    return []
  }

  logDebug(`正在为会话 ${config.sessionId} 上传 ${files.length} 个文件`)
  const startTime = Date.now()

  const results = await parallelWithLimit(
    files,
    file => uploadFile(file.path, file.relativePath, config),
    concurrency,
  )

  const elapsedMs = Date.now() - startTime
  const successCount = count(results, r => r.success)
  logDebug(`已在 ${elapsedMs}ms 内上传 ${successCount}/${files.length} 个文件`)

  return results
}

// ============================================================================
// 列出文件函数（1P/Cloud 模式）
// ============================================================================

/** * 从 listFilesCreatedAfter 返回的文件元数据 */
export type FileMetadata = {
  filename: string
  fileId: string
  size: number
}

/** * 列出在指定时间戳之后创建的文件（1P/Cloud 模式）。
 * 使用公共 GET /v1/files 端点及 after_created_at 查询参数。
 * 当 has_more 为 true 时，通过 after_id 游标处理分页。
 *
 * @param afterCreatedAt - ISO 8601 时间戳，用于筛选在此之后创建的文件
 * @param config - Files API 配置
 * @returns 在时间戳之后创建的文件元数据数组 */
export async function listFilesCreatedAfter(
  afterCreatedAt: string,
  config: FilesApiConfig,
): Promise<FileMetadata[]> {
  const baseUrl = config.baseUrl || getDefaultApiBaseUrl()
  const headers = {
    Authorization: `Bearer ${config.oauthToken}`,
    'anthropic-version': ANTHROPIC_VERSION,
    'anthropic-beta': FILES_API_BETA_HEADER,
  }

  logDebug(`正在列出 ${afterCreatedAt} 之后创建的文件`)

  const allFiles: FileMetadata[] = []
  let afterId: string | undefined

  // 分页遍历结果
  while (true) {
    const params: Record<string, string> = {
      after_created_at: afterCreatedAt,
    }
    if (afterId) {
      params.after_id = afterId
    }

    const page = await retryWithBackoff(
      `列出 ${afterCreatedAt} 之后的文件`,
      async () => {
        try {
          const response = await axios.get(`${baseUrl}/v1/files`, {
            headers,
            params,
            timeout: 60000,
            validateStatus: status => status < 500,
          })

          if (response.status === 200) {
            return { done: true, value: response.data }
          }

          if (response.status === 401) {
            logEvent('tengu_file_list_failed', {
              error_type:
                'auth' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
            })
            throw new Error('Authentication failed: invalid or missing API key')
          }
          if (response.status === 403) {
            logEvent('tengu_file_list_failed', {
              error_type:
                'forbidden' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
            })
            throw new Error('列出文件的访问被拒绝')
          }

          return { done: false, error: `状态 ${response.status}` }
        } catch (error) {
          if (!axios.isAxiosError(error)) {
            throw error
          }
          logEvent('tengu_file_list_failed', {
            error_type:
              'network' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          })
          return { done: false, error: error.message }
        }
      },
    )

    const files = page.data || []
    for (const f of files) {
      allFiles.push({
        filename: f.filename,
        fileId: f.id,
        size: f.size_bytes,
      })
    }

    if (!page.has_more) {
      break
    }

    // 使用最后一个文件的 ID 作为下一页的游标
    const lastFile = files.at(-1)
    if (!lastFile?.id) {
      break
    }
    afterId = lastFile.id
  }

  logDebug(`已列出 ${allFiles.length} 个在 ${afterCreatedAt} 之后创建的文件`)
  return allFiles
}

// ============================================================================
// 解析函数
// ============================================================================

/** * 从 CLI 参数解析文件附件规格
 * 格式：<file_id>:<relative_path>
 *
 * @param fileSpecs - 文件规格字符串数组
 * @returns 解析后的文件附件 */
export function parseFileSpecs(fileSpecs: string[]): File[] {
  const files: File[] = []

  // Sandbox-gateway 可能将多个规格作为单个空格分隔的字符串传递
  const expandedSpecs = fileSpecs.flatMap(s => s.split(' ').filter(Boolean))

  for (const spec of expandedSpecs) {
    const colonIndex = spec.indexOf(':')
    if (colonIndex === -1) {
      continue
    }

    const fileId = spec.substring(0, colonIndex)
    const relativePath = spec.substring(colonIndex + 1)

    if (!fileId || !relativePath) {
      logDebugError(
        `无效的文件规格：${spec}。file_id 和 path 均为必需项`,
      )
      continue
    }

    files.push({ fileId, relativePath })
  }

  return files
}
