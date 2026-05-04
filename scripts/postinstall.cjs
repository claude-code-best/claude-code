#!/usr/bin/env node
/**
 * Postinstall script — runs automatically after `bun install` or `npm install`.
 *
 * Downloads ripgrep binary (idempotent, skips if exists).
 * Works in dev mode (src/ exists), published mode (dist/ exists), with bun or node.
 *
 * Usage:
 *   node scripts/postinstall.js
 *   node scripts/postinstall.js --force
 *   bun run scripts/postinstall.js
 */

const {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  chmodSync,
} = require('fs')
const { spawnSync } = require('child_process')
const { setDefaultResultOrder } = require('node:dns')
const path = require('path')
const os = require('os')

// Prefer IPv4 first — Bun on Windows sometimes fails GitHub over broken IPv6 paths.
try {
  setDefaultResultOrder('ipv4first')
} catch {
  /* ignore */
}

// --- Config ---

const RG_VERSION = '15.0.1'
const DEFAULT_RELEASE_BASE = `https://github.com/microsoft/ripgrep-prebuilt/releases/download/v${RG_VERSION}`
const MIRROR_RELEASE_BASE = `https://ghproxy.net/https://github.com/microsoft/ripgrep-prebuilt/releases/download/v${RG_VERSION}`
const RELEASE_BASE = (
  process.env.RIPGREP_DOWNLOAD_BASE ?? DEFAULT_RELEASE_BASE
).replace(/\/$/, '')

const scriptDir = path.dirname(__filename)
const projectRoot = path.resolve(scriptDir, '..')

// --- Platform mapping ---

function getPlatformMapping() {
  const arch = process.arch
  const platform = process.platform

  if (platform === 'darwin') {
    if (arch === 'arm64')
      return { target: 'aarch64-apple-darwin', ext: 'tar.gz' }
    if (arch === 'x64') return { target: 'x86_64-apple-darwin', ext: 'tar.gz' }
    throw new Error(`Unsupported macOS arch: ${arch}`)
  }

  if (platform === 'win32') {
    if (arch === 'x64') return { target: 'x86_64-pc-windows-msvc', ext: 'zip' }
    if (arch === 'arm64')
      return { target: 'aarch64-pc-windows-msvc', ext: 'zip' }
    throw new Error(`Unsupported Windows arch: ${arch}`)
  }

  if (platform === 'linux') {
    const isMusl = detectMusl()
    if (arch === 'x64') {
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

function detectMusl() {
  const muslArch = process.arch === 'x64' ? 'x86_64' : 'aarch64'
  try {
    statSync(`/lib/libc.musl-${muslArch}.so.1`)
    return true
  } catch {
    return false
  }
}

// --- Paths ---

function getVendorDir() {
  if (existsSync(path.join(projectRoot, 'src'))) {
    return path.resolve(projectRoot, 'src', 'utils', 'vendor', 'ripgrep')
  }
  return path.resolve(projectRoot, 'dist', 'vendor', 'ripgrep')
}

function getBinaryPath() {
  const dir = getVendorDir()
  const subdir = `${process.arch}-${process.platform}`
  const binary = process.platform === 'win32' ? 'rg.exe' : 'rg'
  return path.resolve(dir, subdir, binary)
}

// --- Download helpers ---

function proxyEnvSet() {
  const v = s => (s ?? '').trim()
  return !!(
    v(process.env.HTTPS_PROXY) ||
    v(process.env.HTTP_PROXY) ||
    v(process.env.ALL_PROXY) ||
    v(process.env.https_proxy) ||
    v(process.env.http_proxy)
  )
}

function tryPowerShellDownload(url, dest) {
  const u = url.replace(/'/g, "''")
  const d = dest.replace(/'/g, "''")
  const cmd = `Invoke-WebRequest -Uri '${u}' -OutFile '${d}' -UseBasicParsing`
  const result = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      cmd,
    ],
    { stdio: 'pipe', windowsHide: true },
  )
  return result.status === 0 && existsSync(dest) && statSync(dest).size > 0
}

function tryCurlDownload(url, dest) {
  const curl = process.platform === 'win32' ? 'curl.exe' : 'curl'
  const result = spawnSync(curl, ['-fsSL', '-L', '--fail', '-o', dest, url], {
    stdio: 'pipe',
    windowsHide: true,
  })
  return result.status === 0 && existsSync(dest) && statSync(dest).size > 0
}

async function fetchRelease(url) {
  if (proxyEnvSet()) {
    // Dynamic require so it works in node without bundling issues
    const undici = require('undici')
    return await undici.fetch(url, {
      redirect: 'follow',
      dispatcher: new undici.EnvHttpProxyAgent(),
    })
  }
  // Node 18+ has global fetch, Bun has it too
  return await fetch(url, { redirect: 'follow' })
}

async function downloadUrlToBuffer(url) {
  const response = await fetchRelease(url)
  if (!response.ok) {
    throw new Error(
      `Download failed: ${response.status} ${response.statusText}`,
    )
  }
  return Buffer.from(await response.arrayBuffer())
}

async function downloadUrlToBufferWithFallback(url) {
  let firstError
  try {
    return await downloadUrlToBuffer(url)
  } catch (e) {
    firstError = e
  }

  const tmpRoot = path.join(
    os.tmpdir(),
    `ripgrep-dl-${process.pid}-${Date.now()}`,
  )
  const tmpFile = path.join(tmpRoot, 'archive')
  mkdirSync(tmpRoot, { recursive: true })
  try {
    if (process.platform === 'win32' && tryPowerShellDownload(url, tmpFile)) {
      return readFileSync(tmpFile)
    }
    if (tryCurlDownload(url, tmpFile)) {
      return readFileSync(tmpFile)
    }
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true })
  }

  throw firstError
}

// --- Extract ---

function findZipEntryKey(files, want) {
  return Object.keys(files).find(k => {
    const norm = k.replace(/\\/g, '/')
    return norm === want || norm.endsWith(`/${want}`)
  })
}

async function extractZip(buffer, binaryPath, extractedBinary) {
  const binaryDir = path.dirname(binaryPath)
  // Try fflate first (bundled dep)
  let fflateError
  try {
    const { unzipSync } = require('fflate')
    const unzipped = unzipSync(new Uint8Array(buffer))
    const key = findZipEntryKey(unzipped, extractedBinary)
    if (!key) {
      throw new Error(`Binary ${extractedBinary} not found in zip`)
    }
    writeFileSync(binaryPath, Buffer.from(unzipped[key]))
    return
  } catch (e) {
    fflateError = e
  }

  // Fallback: PowerShell Expand-Archive or unzip CLI
  const tmpDir = path.join(binaryDir, '.tmp-download')
  rmSync(tmpDir, { recursive: true, force: true })
  mkdirSync(tmpDir, { recursive: true })
  try {
    const assetName = `archive.zip`
    const archivePath = path.join(tmpDir, assetName)
    writeFileSync(archivePath, buffer)

    let extracted = false
    if (process.platform === 'win32') {
      const psCmd = `Expand-Archive -Path '${archivePath.replace(/'/g, "''")}' -DestinationPath '${tmpDir.replace(/'/g, "''")}' -Force`
      const psResult = spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          psCmd,
        ],
        { stdio: 'pipe', windowsHide: true },
      )
      if (psResult.status === 0) {
        extracted = true
      }
    }

    if (!extracted) {
      const result = spawnSync('unzip', ['-o', archivePath, '-d', tmpDir], {
        stdio: 'pipe',
      })
      if (result.status !== 0) {
        const unzipErr = result.stderr?.toString().trim() || 'command not found'
        const fflateMsg =
          fflateError instanceof Error
            ? fflateError.message
            : String(fflateError)
        throw new Error(
          `zip extraction failed (fflate: ${fflateMsg}; unzip: ${unzipErr})`,
        )
      }
    }

    const srcBinary = path.join(tmpDir, extractedBinary)
    if (!existsSync(srcBinary)) {
      throw new Error(`Binary not found at expected path: ${srcBinary}`)
    }
    renameSync(srcBinary, binaryPath)
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

async function extractTarGz(buffer, binaryPath, extractedBinary, assetName) {
  const binaryDir = path.dirname(binaryPath)
  const tmpDir = path.join(binaryDir, '.tmp-download')
  rmSync(tmpDir, { recursive: true, force: true })
  mkdirSync(tmpDir, { recursive: true })
  try {
    const archivePath = path.join(tmpDir, assetName)
    writeFileSync(archivePath, buffer)
    const result = spawnSync('tar', ['xzf', archivePath, '-C', tmpDir], {
      stdio: 'pipe',
    })
    if (result.status !== 0) {
      throw new Error(`tar extract failed: ${result.stderr?.toString()}`)
    }
    const srcBinary = path.join(tmpDir, extractedBinary)
    if (!existsSync(srcBinary)) {
      throw new Error(`Binary not found at expected path: ${srcBinary}`)
    }
    renameSync(srcBinary, binaryPath)
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

// --- Main ---

async function downloadAndExtract() {
  const { target, ext } = getPlatformMapping()
  const assetName = `ripgrep-v${RG_VERSION}-${target}.${ext}`

  const binaryPath = getBinaryPath()
  const binaryDir = path.dirname(binaryPath)

  const force = process.argv.includes('--force')
  if (!force && existsSync(binaryPath)) {
    const stat = statSync(binaryPath)
    if (stat.size > 0) {
      console.log(`[ripgrep] Binary already exists at ${binaryPath}, skipping.`)
      return
    }
  }

  console.log(`[ripgrep] Downloading v${RG_VERSION} for ${target}...`)

  const extractedBinary = process.platform === 'win32' ? 'rg.exe' : 'rg'

  const mirrors = [RELEASE_BASE]
  if (RELEASE_BASE === DEFAULT_RELEASE_BASE.replace(/\/$/, '')) {
    mirrors.push(MIRROR_RELEASE_BASE.replace(/\/$/, ''))
  }

  let buffer
  let lastError
  for (const base of mirrors) {
    const url = `${base}/${assetName}`
    try {
      console.log(`[ripgrep] Trying ${url}`)
      buffer = await downloadUrlToBufferWithFallback(url)
      break
    } catch (e) {
      console.warn(
        `[ripgrep] Download from ${base} failed: ${e instanceof Error ? e.message : e}`,
      )
      lastError = e
    }
  }
  if (!buffer) {
    throw lastError
  }

  try {
    console.log(`[ripgrep] Downloaded ${Math.round(buffer.length / 1024)} KB`)

    mkdirSync(binaryDir, { recursive: true })

    if (ext === 'tar.gz') {
      await extractTarGz(buffer, binaryPath, extractedBinary, assetName)
    } else {
      await extractZip(buffer, binaryPath, extractedBinary)
    }

    if (process.platform !== 'win32') {
      chmodSync(binaryPath, 0o755)
    }

    console.log(`[ripgrep] Installed to ${binaryPath}`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const hint =
      'Check network or set HTTPS_PROXY. If GitHub is blocked, set RIPGREP_DOWNLOAD_BASE to a mirror (see script header).'
    throw new Error(`${msg} ${hint}`)
  }
}

async function main() {
  await downloadAndExtract()
}

main().catch(error => {
  const msg = error instanceof Error ? error.message : String(error)
  console.error(`[postinstall] ripgrep download failed (non-fatal): ${msg}`)
  console.error(
    `[postinstall] You can install ripgrep manually: https://github.com/BurntSushi/ripgrep#installation`,
  )
  // Never exit with error code — postinstall must not break install
  process.exit(0)
})
