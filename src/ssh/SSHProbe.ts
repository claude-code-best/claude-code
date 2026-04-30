import { logForDebugging } from 'src/utils/debug.js'

const PROBE_TIMEOUT_MS = 15_000

export interface ProbeResult {
  hasBinary: boolean
  remoteVersion: string | null
  remotePlatform: 'linux' | 'darwin'
  remoteArch: 'x64' | 'arm64'
  defaultCwd: string
  binaryPath: string | null
}

export class SSHProbeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SSHProbeError'
  }
}

export async function probeRemote(
  host: string,
  onProgress?: (msg: string) => void,
): Promise<ProbeResult> {
  onProgress?.('Probing remote host…')

  const proc = Bun.spawn(
    [
      'ssh',
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=10',
      host,
      'CLAUDE_BIN=$(test -x "$HOME/.local/bin/claude" && echo "$HOME/.local/bin/claude" || command -v claude 2>/dev/null); echo "$CLAUDE_BIN"; $CLAUDE_BIN --version 2>/dev/null; uname -sm; pwd',
    ],
    { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
  )

  const result = await Promise.race([
    proc.exited,
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new SSHProbeError(
              `SSH probe timed out after ${PROBE_TIMEOUT_MS / 1000}s`,
            ),
          ),
        PROBE_TIMEOUT_MS,
      ),
    ),
  ])

  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()

  if (result !== 0) {
    const detail = stderr.trim() || `exit code ${result}`
    throw new SSHProbeError(`SSH probe failed: ${detail}`)
  }

  const lines = stdout
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
  logForDebugging(`[SSHProbe] raw lines: ${JSON.stringify(lines)}`)

  const unameIdx = lines.findIndex(l => /^(Linux|Darwin)\s/.test(l))
  if (unameIdx === -1) {
    throw new SSHProbeError(
      'Could not detect remote platform (uname output missing)',
    )
  }

  const binaryPath = unameIdx >= 2 ? lines[unameIdx - 2] || null : null
  const versionLine = unameIdx >= 1 ? lines[unameIdx - 1] || null : null
  const remoteVersion =
    versionLine && /^\d+\.\d+/.test(versionLine) ? versionLine : null
  const hasBinary = binaryPath !== null && binaryPath.startsWith('/')
  const defaultCwd = lines[unameIdx + 1] || '/'

  const [osName, arch] = lines[unameIdx]!.split(/\s+/)

  const remotePlatform = osName === 'Darwin' ? 'darwin' : 'linux'
  const remoteArch: 'x64' | 'arm64' =
    arch === 'aarch64' || arch === 'arm64' ? 'arm64' : 'x64'

  onProgress?.(`Detected ${remotePlatform}/${remoteArch}`)

  return {
    hasBinary: hasBinary && remoteVersion !== null,
    remoteVersion,
    remotePlatform,
    remoteArch,
    defaultCwd,
    binaryPath: hasBinary ? binaryPath : null,
  }
}
