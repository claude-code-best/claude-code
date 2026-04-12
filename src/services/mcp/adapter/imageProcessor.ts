// Host image processor adapter — bridges maybeResizeAndDownsampleImageBuffer to mcp-client's ImageProcessor interface

import type { ImageProcessor } from 'mcp-client'
import { maybeResizeAndDownsampleImageBuffer } from '../../../utils/imageResizer.js'

/**
 * Creates an ImageProcessor implementation using the host's image resizing.
 */
export function createMcpImageProcessor(): ImageProcessor {
  return {
    async resizeAndDownsample(buffer: Buffer) {
      const result = await maybeResizeAndDownsampleImageBuffer(buffer, buffer.length, 'png')
      return result.buffer
    },
  }
}
