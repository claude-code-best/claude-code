/**
 * Download ripgrep binary from GitHub releases.
 *
 * Run automatically via `bun install` (postinstall hook),
 * or manually: `bun run scripts/download-ripgrep.ts [--force]`
 *
 * Idempotent — skips download if the binary already exists.
 * Use --force to re-download.
 */

import { existsSync, mkdirSync, renameSync, rmSync, statSync } from 'fs'
import { chmodSync } from 'fs'
import { spawnSync } from 'child_process'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const RG_VERSION = '15.0.1'
const BASE_URL = `https://gh-proxy.com/github.com/microsoft/ripgrep-prebuilt/releases/download/v${RG_VERSION}`

// --- Platform mapping ---

type PlatformMapping = {
  target: string
  ext: 'tar.gz' | 'zip'
}

function getPlatformMapping(): PlatformMapping {
  const arch = process.arch
  const platform = process.platform

  if (platform === 'darwin') {
    if (arch === 'arm64') return { target: 'aarch64-apple-darwin', ext: 'tar.gz' }
    if (arch === 'x64') return { target: 'x86_64-apple-darwin', ext: 'tar.gz' }
    throw new Error(`Unsupported macOS arch: ${arch}`)
  }

  if (platform === 'win32') {
    if (arch === 'x64') return { target: 'x86_64-pc-windows-msvc', ext: 'zip' }
    if (arch === 'arm64') return { target: 'aarch64-pc-windows-msvc', ext: 'zip' }
    throw new Error(`Unsupported Windows arch: ${arch}`)
  }

  if (platform === 'linux') {
    const isMusl = detectMusl()
    if (arch === 'x64') {
      // x64 Linux always uses musl (statically linked, most portable)
      return { target: 'x86_64-unknown-linux-musl', ext: 'tar.gz' }
    }
    if (arch === 'arm64') {
      return isMusl
        ? { target: 'aarch64-unknown-linux-musl', ext: 'tar.gz' }
        : { target: 'aarch64-unknown-linux-gnu', ext: 'tar.gz' }
    }
    throw new Error(`Unsupported Linux arch: ${arch}`)
  }

  throw new Error(`Unsupported platform: ${platform}`)
}

function detectMusl(): boolean {
  const muslArch = process.arch === 'x64' ? 'x86_64' : 'aarch64'
  try {
    statSync(`/lib/libc.musl-${muslArch}.so.1`)
    return true
  } catch {
    return false
  }
}

// --- Target vendor path (must match ripgrep.ts logic) ---

function getVendorDir(): string {
  const packageRoot = path.resolve(__dirname, '..')

  // Dev mode: package root has src/ directory
  // ripgrep.ts at src/utils/ripgrep.ts: __dirname = src/utils/
  // vendor path = src/utils/vendor/ripgrep/
  if (existsSync(path.join(packageRoot, 'src'))) {
    return path.resolve(packageRoot, 'src', 'utils', 'vendor', 'ripgrep')
  }

  // Published mode: compiled chunks are flat in dist/
  // ripgrep chunk at dist/xxxx.js: __dirname = dist/
  // vendor path = dist/vendor/ripgrep/
  return path.resolve(packageRoot, 'dist', 'vendor', 'ripgrep')
}

function getBinaryPath(): string {
  const dir = getVendorDir()
  const subdir = `${process.arch}-${process.platform}`
  const binary = process.platform === 'win32' ? 'rg.exe' : 'rg'
  return path.resolve(dir, subdir, binary)
}

// --- Download & extract ---

async function downloadAndExtract(): Promise<void> {
  const { target, ext } = getPlatformMapping()
  const assetName = `ripgrep-v${RG_VERSION}-${target}.${ext}`
  const downloadUrl = `${BASE_URL}/${assetName}`

  const binaryPath = getBinaryPath()
  const binaryDir = path.dirname(binaryPath)

  // Idempotent: skip if binary exists and has content
  const force = process.argv.includes('--force')
  if (!force && existsSync(binaryPath)) {
    const stat = statSync(binaryPath)
    if (stat.size > 0) {
      console.log(`[ripgrep] Binary already exists at ${binaryPath}, skipping.`)
      return
    }
  }

  console.log(`[ripgrep] Downloading v${RG_VERSION} for ${target}...`)
  console.log(`[ripgrep] URL: ${downloadUrl}`)

  // Prepare temp directory
  const tmpDir = path.join(binaryDir, '.tmp-download')
  rmSync(tmpDir, { recursive: true, force: true })
  mkdirSync(tmpDir, { recursive: true })

  try {
    const archivePath = path.join(tmpDir, assetName)

    // Download
    const response = await fetch(downloadUrl, { redirect: 'follow' })
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status} ${response.statusText}`)
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    const { writeFileSync } = await import('fs')
    writeFileSync(archivePath, buffer)
    console.log(`[ripgrep] Downloaded ${Math.round(buffer.length / 1024)} KB`)

    // Extract
    mkdirSync(binaryDir, { recursive: true })

    if (ext === 'tar.gz') {
      const result = spawnSync('tar', ['xzf', archivePath, '-C', tmpDir], {
        stdio: 'pipe',
      })
      if (result.status !== 0) {
        throw new Error(`tar extract failed: ${result.stderr?.toString()}`)
      }
    } else {
      // .zip
      const result = spawnSync('unzip', ['-o', archivePath, '-d', tmpDir], {
        stdio: 'pipe',
      })
      if (result.status !== 0) {
        throw new Error(`unzip failed: ${result.stderr?.toString()}`)
      }
    }

    // Find the rg binary in the extracted directory
    // microsoft/ripgrep-prebuilt archives extract flat: ./rg (no subdirectory)
    const extractedBinary = process.platform === 'win32' ? 'rg.exe' : 'rg'
    const srcBinary = path.join(tmpDir, extractedBinary)

    if (!existsSync(srcBinary)) {
      throw new Error(`Binary not found at expected path: ${srcBinary}`)
    }

    // Move to final location
    renameSync(srcBinary, binaryPath)

    // Make executable (non-Windows)
    if (process.platform !== 'win32') {
      chmodSync(binaryPath, 0o755)
    }

    console.log(`[ripgrep] Installed to ${binaryPath}`)
  } finally {
    // Cleanup temp directory
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

// --- Main ---

downloadAndExtract().catch(error => {
  console.error(`[ripgrep] Download failed: ${error.message}`)
  console.error(`[ripgrep] You can install ripgrep manually: https://github.com/BurntSushi/ripgrep#installation`)
  // Don't exit with error code — postinstall should not break bun install
  process.exit(0)
})
