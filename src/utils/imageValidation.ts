import { API_IMAGE_MAX_BASE64_SIZE } from '../constants/apiLimits.js'
import { logEvent } from '../services/analytics/index.js'
import { formatFileSize } from './format.js'

/**
 * 关于超大图像的信息。
 */
export type OversizedImage = {
  index: number
  size: number
}

/**
 * 当一张或多张图像超出 API 尺寸限制时抛出的错误。
 */
export class ImageSizeError extends Error {
  constructor(oversizedImages: OversizedImage[], maxSize: number) {
    let message: string
    const firstImage = oversizedImages[0]
    if (oversizedImages.length === 1 && firstImage) {
      message =
        `图像 Base64 尺寸（${formatFileSize(firstImage.size)}）超过 API 限制（${formatFileSize(maxSize)}）。` +
        `请在发送前调整图像大小。`
    } else {
      message =
        `${oversizedImages.length} 张图像超过 API 限制（${formatFileSize(maxSize)}）：` +
        oversizedImages
          .map(img => `图像 ${img.index}：${formatFileSize(img.size)}`)
          .join('、') +
        `。请在发送前调整这些图像的大小。`
    }
    super(message)
    this.name = 'ImageSizeError'
  }
}

/**
 * Type guard to check if a block is a base64 image block
 */
function isBase64ImageBlock(
  block: unknown,
): block is { type: 'image'; source: { type: 'base64'; data: string } } {
  if (typeof block !== 'object' || block === null) return false
  const b = block as Record<string, unknown>
  if (b.type !== 'image') return false
  if (typeof b.source !== 'object' || b.source === null) return false
  const source = b.source as Record<string, unknown>
  return source.type === 'base64' && typeof source.data === 'string'
}

/**
* 验证消息中的所有图像是否在 API 的大小限制之内。
* 这是 API 边界的一道安全屏障，用于捕获任何可能在上游处理过程中遗漏的超大图像。
*
* 注意：API 的 5MB 限制适用于 base64 编码的字符串长度，
* 而不是解码后的原始字节长度。
*
* 适用于 UserMessage/AssistantMessage 类型（具有 { type, message }）
* 以及原始 MessageParam 类型（具有 { role, content }）。
*
* @param messages - 要验证的消息数组
* @throws ImageSizeError 如果任何图像超过 API 限制
*/
export function validateImagesForAPI(messages: unknown[]): void {
  const oversizedImages: OversizedImage[] = []
  let imageIndex = 0

  for (const msg of messages) {
    if (typeof msg !== 'object' || msg === null) continue

    const m = msg as Record<string, unknown>

    // Handle wrapped message format { type: 'user', message: { role, content } }
    // Only check user messages
    if (m.type !== 'user') continue

    const innerMessage = m.message as Record<string, unknown> | undefined
    if (!innerMessage) continue

    const content = innerMessage.content
    if (typeof content === 'string' || !Array.isArray(content)) continue

    for (const block of content) {
      if (isBase64ImageBlock(block)) {
        imageIndex++
        // Check the base64-encoded string length directly (not decoded bytes)
        // The API limit applies to the base64 payload size
        const base64Size = block.source.data.length
        if (base64Size > API_IMAGE_MAX_BASE64_SIZE) {
          logEvent('tengu_image_api_validation_failed', {
            base64_size_bytes: base64Size,
            max_bytes: API_IMAGE_MAX_BASE64_SIZE,
          })
          oversizedImages.push({ index: imageIndex, size: base64Size })
        }
      }
    }
  }

  if (oversizedImages.length > 0) {
    throw new ImageSizeError(oversizedImages, API_IMAGE_MAX_BASE64_SIZE)
  }
}
