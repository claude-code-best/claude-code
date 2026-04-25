import { createRequire } from 'node:module'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
// createRequire works in both Bun and Node.js ESM contexts.
// Needed because this package is "type": "module" but uses require() for
// loading native .node addons — bare require is not available in Node.js ESM.
const nodeRequire = createRequire(import.meta.url)

/**
 * Resolve the "vendor root" directory where native .node binaries live.
 *
 * - Dev mode:  import.meta.url → packages/audio-capture-napi/src/index.ts
 *              → vendor root = <project>/vendor/
 * - Bun build: import.meta.url → dist/chunk-xxx.js
 *              → vendor root = <project>/dist/vendor/
 * - Vite build: import.meta.url → dist/chunks/chunk-xxx.js
 *              → vendor root = <project>/dist/vendor/
 */
function getVendorRoot(): string {
  const filePath = fileURLToPath(import.meta.url)
  const dir = dirname(filePath)
  const parts = dir.split(sep)
  const distIdx = parts.lastIndexOf('dist')
  if (distIdx !== -1) {
    return parts.slice(0, distIdx + 1).join(sep) + sep + 'vendor'
  }
  // Dev mode — go up from packages/audio-capture-napi/src/ to project root
  return resolve(dir, '..', '..', '..', 'vendor')
}

type AudioCaptureNapi = {
  startRecording(
    onData: (data: Buffer) => void,
    onEnd: () => void,
  ): boolean
  stopRecording(): void
  isRecording(): boolean
  startPlayback(sampleRate: number, channels: number): boolean
  writePlaybackData(data: Buffer): void
  stopPlayback(): void
  isPlaying(): boolean
  // TCC microphone authorization status (macOS only):
  // 0 = notDetermined, 1 = restricted, 2 = denied, 3 = authorized.
  // Linux: always returns 3 (authorized) — no system-level microphone permission API.
  // Windows: returns 3 (authorized) if registry key absent or allowed,
  //          2 (denied) if microphone access is explicitly denied.
  microphoneAuthorizationStatus?(): number
}

let cachedModule: AudioCaptureNapi | null = null
let loadAttempted = false

function loadModule(): AudioCaptureNapi | null {
  if (loadAttempted) {
    return cachedModule
  }
  loadAttempted = true

  // Supported platforms: macOS (darwin), Linux, Windows (win32)
  const platform = process.platform
  if (platform !== 'darwin' && platform !== 'linux' && platform !== 'win32') {
    return null
  }

  // Candidate 1: native-embed path (bun compile). AUDIO_CAPTURE_NODE_PATH is
  // defined at build time in build-with-plugins.ts for native builds only — the
  // define resolves it to the static literal "../../audio-capture.node" so bun
  // compile can rewrite it to /$bunfs/root/audio-capture.node. MUST stay a
  // direct require(env var) — bun cannot analyze require(variable) from a loop.
  if (process.env.AUDIO_CAPTURE_NODE_PATH) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      cachedModule = nodeRequire(
        process.env.AUDIO_CAPTURE_NODE_PATH,
      ) as AudioCaptureNapi
      return cachedModule
    } catch {
      // fall through to runtime fallbacks below
    }
  }

  // Candidates 2-5: resolved vendor path + relative fallbacks.
  // The primary candidate uses getVendorRoot() to find the correct dist root
  // regardless of chunk nesting depth. Relative fallbacks cover edge cases.
  const platformDir = `${process.arch}-${platform}`
  const binaryRel = `audio-capture/${platformDir}/audio-capture.node`
  const vendorRoot = getVendorRoot()
  const fallbacks = [
    resolve(vendorRoot, binaryRel),
    `./vendor/${binaryRel}`,
    `../vendor/${binaryRel}`,
    `../../vendor/${binaryRel}`,
    `${process.cwd()}/vendor/${binaryRel}`,
  ]
  for (const p of fallbacks) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      cachedModule = nodeRequire(p) as AudioCaptureNapi
      return cachedModule
    } catch {
      // try next
    }
  }
  return null
}

export function isNativeAudioAvailable(): boolean {
  return loadModule() !== null
}

export function startNativeRecording(
  onData: (data: Buffer) => void,
  onEnd: () => void,
): boolean {
  const mod = loadModule()
  if (!mod) {
    return false
  }
  return mod.startRecording(onData, onEnd)
}

export function stopNativeRecording(): void {
  const mod = loadModule()
  if (!mod) {
    return
  }
  mod.stopRecording()
}

export function isNativeRecordingActive(): boolean {
  const mod = loadModule()
  if (!mod) {
    return false
  }
  return mod.isRecording()
}

export function startNativePlayback(
  sampleRate: number,
  channels: number,
): boolean {
  const mod = loadModule()
  if (!mod) {
    return false
  }
  return mod.startPlayback(sampleRate, channels)
}

export function writeNativePlaybackData(data: Buffer): void {
  const mod = loadModule()
  if (!mod) {
    return
  }
  mod.writePlaybackData(data)
}

export function stopNativePlayback(): void {
  const mod = loadModule()
  if (!mod) {
    return
  }
  mod.stopPlayback()
}

export function isNativePlaying(): boolean {
  const mod = loadModule()
  if (!mod) {
    return false
  }
  return mod.isPlaying()
}

// Returns the microphone authorization status.
// On macOS, returns the TCC status: 0=notDetermined, 1=restricted, 2=denied, 3=authorized.
// On Linux, always returns 3 (authorized) — no system-level mic permission API.
// On Windows, returns 3 (authorized) if registry key absent or allowed, 2 (denied) if explicitly denied.
// Returns 0 (notDetermined) if the native module is unavailable.
export function microphoneAuthorizationStatus(): number {
  const mod = loadModule()
  if (!mod || !mod.microphoneAuthorizationStatus) {
    return 0
  }
  return mod.microphoneAuthorizationStatus()
}
