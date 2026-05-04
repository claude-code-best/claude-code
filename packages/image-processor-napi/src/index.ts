import { readFileSync, unlinkSync } from 'node:fs'
import sharpModule from 'sharp'

export const sharp = sharpModule

interface NativeModule {
  hasClipboardImage(): boolean
  readClipboardImage(
    maxWidth?: number,
    maxHeight?: number,
  ): {
    png: Buffer
    width: number
    height: number
    originalWidth: number
    originalHeight: number
  } | null
}

function createDarwinNativeModule(): NativeModule {
  return {
    hasClipboardImage(): boolean {
      try {
        const result = Bun.spawnSync({
          cmd: [
            'osascript',
            '-e',
            'try\nthe clipboard as «class PNGf»\nreturn "yes"\non error\nreturn "no"\nend try',
          ],
          stdout: 'pipe',
          stderr: 'pipe',
        })
        const output = result.stdout.toString().trim()
        return output === 'yes'
      } catch {
        return false
      }
    },

    readClipboardImage(maxWidth?: number, maxHeight?: number) {
      try {
        // Use osascript to read clipboard image as PNG data and write to a temp file,
        // then read the temp file back
        const tmpPath = `/tmp/claude_clipboard_native_${Date.now()}.png`
        const script = `
set png_data to (the clipboard as «class PNGf»)
set fp to open for access POSIX file "${tmpPath}" with write permission
write png_data to fp
close access fp
return "${tmpPath}"
`
        const result = Bun.spawnSync({
          cmd: ['osascript', '-e', script],
          stdout: 'pipe',
          stderr: 'pipe',
        })

        if (result.exitCode !== 0) {
          return null
        }

        const file = Bun.file(tmpPath)
        const buffer: Buffer = readFileSync(tmpPath)

        // Clean up temp file
        try {
          unlinkSync(tmpPath)
        } catch {
          // ignore cleanup errors
        }

        if (buffer.length === 0) {
          return null
        }

        // Read PNG dimensions from IHDR chunk
        // PNG header: 8 bytes signature, then IHDR chunk
        // IHDR starts at offset 8 (4 bytes length) + 4 bytes "IHDR" + 4 bytes width + 4 bytes height
        let width = 0
        let height = 0
        if (
          buffer.length > 24 &&
          buffer[12] === 0x49 &&
          buffer[13] === 0x48 &&
          buffer[14] === 0x44 &&
          buffer[15] === 0x52
        ) {
          width = buffer.readUInt32BE(16)
          height = buffer.readUInt32BE(20)
        }

        const originalWidth = width
        const originalHeight = height

        // If maxWidth/maxHeight are specified and the image exceeds them,
        // we still return the full PNG - the caller handles resizing via sharp
        // But we report the capped dimensions
        if (maxWidth && maxHeight) {
          if (width > maxWidth || height > maxHeight) {
            const scale = Math.min(maxWidth / width, maxHeight / height)
            width = Math.round(width * scale)
            height = Math.round(height * scale)
          }
        }

        return {
          png: buffer,
          width,
          height,
          originalWidth,
          originalHeight,
        }
      } catch {
        return null
      }
    },
  }
}

export function getNativeModule(): NativeModule | null {
  if (process.platform === 'darwin') {
    return createDarwinNativeModule()
  }
  return null
}

export default sharp
