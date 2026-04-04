/**
 * Gets the ripgrep binary path for the current platform/arch.
 *
 * In compiled mode: decodes base64 from ripgrepAssetBase64.ts, writes to temp,
 * and caches on disk so subsequent starts skip the decode.
 *
 * In dev mode: falls back to SDK's bundled ripgrep path.
 *
 * BUNDLED_MODE is a compile-time constant injected by compile.ts --define flag.
 */
import { writeFileSync, readFileSync } from 'fs'
import { mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { getPlatform } from './platform.js'

// In-memory cache: platform+arch -> absolute path to extracted temp file
const extractedPaths: Record<string, string> = {}

// Global base64 data — loaded once on first access
let globalBase64: Record<string, string> | null = null

// SDK's bundled ripgrep path (used as fallback in dev mode)
function getSdkRipgrepPath(): string {
  const p = getPlatform()
  const arch = process.arch
  if (p === 'windows') return join(process.cwd(), 'node_modules/.bun/@anthropic-ai+claude-agent-sdk@0.2.87+3c5d820c62823f0b/node_modules/@anthropic-ai/claude-agent-sdk/vendor/ripgrep/x64-win32/rg.exe')
  if (p === 'macos') return join(process.cwd(), 'node_modules/.bun/@anthropic-ai+claude-agent-sdk@0.2.87+3c5d820c62823f0b/node_modules/@anthropic-ai/claude-agent-sdk/vendor/ripgrep', arch === 'arm64' ? 'arm64-darwin/rg' : 'x64-darwin/rg')
  return join(process.cwd(), 'node_modules/.bun/@anthropic-ai+claude-agent-sdk@0.2.87+3c5d820c62823f0b/node_modules/@anthropic-ai/claude-agent-sdk/vendor/ripgrep', arch === 'arm64' ? 'arm64-linux/rg' : 'x64-linux/rg')
}

function getPlatformKey(): string {
  const platform = getPlatform()
  const arch = process.arch
  if (platform === 'windows') return 'windows_x64'
  if (platform === 'macos') return arch === 'arm64' ? 'darwin_arm64' : 'darwin_x64'
  return arch === 'arm64' ? 'linux_arm64' : 'linux_x64'
}

// BUNDLED_MODE is injected at compile time by compile.ts --define flag.
// In dev mode, this variable is undefined.
declare const BUNDLED_MODE: string | undefined

/**
 * Load base64 data asynchronously (first call only).
 * Subsequent calls use the cached global.
 */
async function ensureBase64Loaded(): Promise<Record<string, string>> {
  if (globalBase64 !== null) return globalBase64
  // Dynamic import so the 6.9MB base64 string isn't loaded in dev mode
  const mod = await import('./ripgrepAssetBase64.js')
  globalBase64 = mod.RIPGREP_BINARIES ?? {}
  return globalBase64
}

/**
 * Get the ripgrep binary path for the current platform/arch.
 * In compiled mode: decodes base64, extracts to temp, caches by version fingerprint.
 * In dev mode: returns SDK path directly.
 */
export function getRipgrepBinaryPath(): string {
  const key = getPlatformKey()
  if (extractedPaths[key]) return extractedPaths[key]

  const tmpDir = join(tmpdir(), 'claude-code-ripgrep')
  const filename = key === 'windows_x64' ? 'rg.exe' : 'rg'
  const filePath = join(tmpDir, filename)
  const versionPath = join(tmpDir, `${key}.version`)

  // Dev mode: use SDK path directly
  if (typeof BUNDLED_MODE === 'undefined') {
    const sdkPath = getSdkRipgrepPath()
    extractedPaths[key] = sdkPath
    return sdkPath
  }

  // Compiled mode: must use base64 decode (synchronous path — loaded eagerly from embedded module)
  // In the compiled exe, require() resolves to the embedded ripgrepAssetBase64.js
  let base64Data: string | undefined
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const RIPGREP_BINARIES: Record<string, string> = require('./ripgrepAssetBase64.js').RIPGREP_BINARIES
    base64Data = RIPGREP_BINARIES[key]
  } catch {
    // require failed — fall back to SDK path
  }

  if (!base64Data) {
    const sdkPath = getSdkRipgrepPath()
    extractedPaths[key] = sdkPath
    return sdkPath
  }

  const versionTag = `b64:${base64Data.length}:${base64Data.slice(0, 16)}:${base64Data.slice(-16)}`

  // Fast cache check: read only the version tag (~50 bytes)
  try {
    const storedTag = readFileSync(versionPath, 'utf8')
    if (storedTag === versionTag && readFileSync(filePath)) {
      extractedPaths[key] = filePath
      return filePath
    }
  } catch {
    // Cache miss or stale
  }

  // Decode and extract
  mkdirSync(tmpDir, { recursive: true })
  const buffer = Buffer.from(base64Data, 'base64')
  writeFileSync(filePath, buffer, { mode: 0o755 })
  writeFileSync(versionPath, versionTag, 'utf8')
  extractedPaths[key] = filePath
  return filePath
}

/**
 * Async version — preloads base64 data before extracting.
 * Call this early (e.g., during startup) to avoid decode delay on first grep.
 */
export async function preloadRipgrepBinary(): Promise<void> {
  getRipgrepBinaryPath()
}
