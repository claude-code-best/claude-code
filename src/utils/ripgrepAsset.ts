/**
 * Ripgrep binary decoded from base64 at runtime.
 *
 * Bun's bundler does not support embedding non-.node binary files via ?url imports
 * or new URL(). The only reliable way to embed a binary into the compiled exe
 * is to base64-encode it and store it as a JS string constant (compile.ts generates
 * ripgrepAssetBase64.ts at build time). Decoded binaries are cached in temp files
 * for the lifetime of the process.
 *
 * Dev mode fallback: reads from SDK's bundled ripgrep if the base64 module is
 * not available (i.e., running via `bun run dev` without a prior `bun run compile`).
 */
import { writeFile, mkdir, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import { getPlatform } from './platform.js'
import { fileURLToPath } from 'url'

// Cache: platform+arch -> absolute path to decoded temp file
const decodedPaths: Record<string, string> = {}

// SDK's bundled ripgrep path (used as fallback in dev mode)
function getSdkRipgrepPath(): string {
  const p = getPlatform()
  const arch = process.arch
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
  if (p === 'windows') return join(repoRoot, 'node_modules/.bun/@anthropic-ai+claude-agent-sdk@0.2.87+3c5d820c62823f0b/node_modules/@anthropic-ai/claude-agent-sdk/vendor/ripgrep/x64-win32/rg.exe')
  if (p === 'macos') return join(repoRoot, 'node_modules/.bun/@anthropic-ai+claude-agent-sdk@0.2.87+3c5d820c62823f0b/node_modules/@anthropic-ai/claude-agent-sdk/vendor/ripgrep', arch === 'arm64' ? 'arm64-darwin/rg' : 'x64-darwin/rg')
  return join(repoRoot, 'node_modules/.bun/@anthropic-ai+claude-agent-sdk@0.2.87+3c5d820c62823f0b/node_modules/@anthropic-ai/claude-agent-sdk/vendor/ripgrep', arch === 'arm64' ? 'arm64-linux/rg' : 'x64-linux/rg')
}

async function tryGetFromBase64(key: string): Promise<string | null> {
  try {
    const { RIPGREP_BINARIES } = await import('./ripgrepAssetBase64.js')
    const base64 = RIPGREP_BINARIES[key]
    if (!base64) return null
    const buffer = Buffer.from(base64, 'base64')
    const tmpDir = join(tmpdir(), 'claude-code-ripgrep')
    const isWindows = key === 'windows_x64'
    const filename = isWindows ? 'rg.exe' : 'rg'
    const filePath = join(tmpDir, filename)
    await mkdir(tmpDir, { recursive: true })
    await writeFile(filePath, buffer)
    return filePath
  } catch {
    return null
  }
}

/**
 * Get the ripgrep binary path for the current platform/arch.
 * Decodes from base64 (compiled mode) or falls back to SDK's ripgrep (dev mode).
 */
export async function getRipgrepBinaryPath(): Promise<string> {
  const platform = getPlatform()
  const arch = process.arch

  let key: string
  if (platform === 'windows') key = 'windows_x64'
  else if (platform === 'macos') key = arch === 'arm64' ? 'darwin_arm64' : 'darwin_x64'
  else key = arch === 'arm64' ? 'linux_arm64' : 'linux_x64'

  if (decodedPaths[key]) return decodedPaths[key]

  // Try base64 decoding first (compiled mode)
  const base64Path = await tryGetFromBase64(key)
  if (base64Path) {
    decodedPaths[key] = base64Path
    return base64Path
  }

  // Fallback: use SDK's bundled ripgrep (dev mode)
  const sdkPath = getSdkRipgrepPath()
  decodedPaths[key] = sdkPath
  return sdkPath
}
