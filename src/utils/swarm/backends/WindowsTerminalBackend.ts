import { randomUUID } from 'crypto'
import { readFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import type { AgentColorName } from '@claude-code-best/builtin-tools/tools/AgentTool/agentColorManager.js'
import { logForDebugging } from '../../../utils/debug.js'
import { execFileNoThrow } from '../../../utils/execFileNoThrow.js'
import { getPlatform, type Platform } from '../../../utils/platform.js'
import { isInWindowsTerminal } from './detection.js'
import { registerWindowsTerminalBackend } from './registry.js'
import type { CreatePaneResult, PaneBackend, PaneId } from './types.js'

type CommandResult = { stdout: string; stderr: string; code: number }
type CommandRunner = (command: string, args: string[]) => Promise<CommandResult>

type PaneStatus = 'registered' | 'spawning' | 'ready' | 'killing' | 'dead'

type WindowsTerminalPane = {
  title: string
  mode: 'pane' | 'window'
  pidFile: string
  status: PaneStatus
  pid?: number
  spawnPromise?: Promise<void>
}

function quotePowerShellString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function wrapPowerShellCommand(command: string, pidFile: string): string {
  const quotedPidFile = quotePowerShellString(pidFile)
  // PowerShell requires try/catch/finally to be a single compound statement —
  // semicolons between the blocks cause "Try 语句缺少自己的 Catch 或 Finally 块".
  // Use newlines (\n) so the parser treats it as one statement.
  return [
    "$ErrorActionPreference = 'Stop'",
    `Set-Content -LiteralPath ${quotedPidFile} -Value $PID`,
    [
      `try { ${command}; if ($LASTEXITCODE -is [int]) { exit $LASTEXITCODE } }`,
      `catch { Write-Error $_; exit 1 }`,
      `finally { Remove-Item -LiteralPath ${quotedPidFile} -Force -ErrorAction SilentlyContinue }`,
    ].join('\n'),
  ].join('; ')
}

const WT_PANE_TIMEOUT_DEFAULT_MS = 8000
const WT_PANE_POLL_INTERVAL_MS = 200

function getWtPaneTimeoutMs(): number {
  const raw = process.env.CLAUDE_WT_PANE_TIMEOUT_MS
  if (!raw) return WT_PANE_TIMEOUT_DEFAULT_MS
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : WT_PANE_TIMEOUT_DEFAULT_MS
}

async function waitForPidFile(
  pidFile: string,
  timeoutMs: number,
): Promise<number> {
  const deadline = Date.now() + timeoutMs
  let lastErr: unknown
  while (Date.now() < deadline) {
    try {
      const content = (await readFile(pidFile, 'utf-8')).trim()
      if (!/^\d+$/.test(content)) {
        lastErr = new Error(
          `pidFile content not a valid pid: ${JSON.stringify(content)}`,
        )
      } else {
        const pid = Number.parseInt(content, 10)
        if (Number.isFinite(pid) && pid > 0) return pid
        lastErr = new Error(`pidFile content parsed to invalid pid: ${pid}`)
      }
    } catch (err) {
      lastErr = err
    }
    await new Promise(r => setTimeout(r, WT_PANE_POLL_INTERVAL_MS))
  }
  throw lastErr ?? new Error('pidFile never appeared')
}

/**
 * WindowsTerminalBackend uses wt.exe to create visible teammate panes/tabs.
 *
 * Windows Terminal's CLI starts commands directly in a new pane; it does not
 * expose a stable pane id that can later receive arbitrary input. To fit the
 * PaneBackend contract, createTeammatePaneInSwarmView allocates an internal id,
 * and sendCommandToPane performs the actual `wt split-pane` launch.
 */
export class WindowsTerminalBackend implements PaneBackend {
  readonly type = 'windows-terminal' as const
  readonly displayName = 'Windows Terminal'
  readonly supportsHideShow = false

  private panes = new Map<PaneId, WindowsTerminalPane>()

  private readonly runCommand: CommandRunner
  private readonly getPlatformValue: () => Platform
  private readonly pidFileDir: string

  constructor(
    runCommandOrOptions?:
      | CommandRunner
      | {
          runCommand?: CommandRunner
          getPlatform?: () => Platform
          pidFileDir?: string
        },
    getPlatformValue?: () => Platform,
  ) {
    if (
      typeof runCommandOrOptions === 'function' ||
      runCommandOrOptions === undefined
    ) {
      this.runCommand = runCommandOrOptions ?? execFileNoThrow
      this.getPlatformValue = getPlatformValue ?? getPlatform
      this.pidFileDir = tmpdir()
    } else {
      this.runCommand = runCommandOrOptions.runCommand ?? execFileNoThrow
      this.getPlatformValue = runCommandOrOptions.getPlatform ?? getPlatform
      this.pidFileDir = runCommandOrOptions.pidFileDir ?? tmpdir()
    }
  }

  private makePidFile(paneId: string): string {
    return join(
      this.pidFileDir,
      `${paneId.replace(/[^a-zA-Z0-9_-]/g, '-')}.pid`,
    )
  }

  async isAvailable(): Promise<boolean> {
    if (this.getPlatformValue() !== 'windows') {
      return false
    }
    // Do NOT run `wt.exe --version` — wt.exe is a UWP app bridge that opens
    // the Windows Terminal app to render version info, producing a phantom
    // "Windows 终端 1.24.x" window every time availability is checked.
    // Instead, check the WT_SESSION env var (set inside WT) or verify the
    // binary exists on PATH without executing it.
    if (process.env.WT_SESSION) {
      return true
    }
    const result = await this.runCommand('where.exe', ['wt.exe'])
    return result.code === 0
  }

  async isRunningInside(): Promise<boolean> {
    return this.getPlatformValue() === 'windows' && isInWindowsTerminal()
  }

  async createTeammatePaneInSwarmView(
    name: string,
    _color: AgentColorName,
  ): Promise<CreatePaneResult> {
    const paneId = `wt-${randomUUID()}`
    const isFirstTeammate = this.panes.size === 0
    this.panes.set(paneId, {
      title: name,
      mode: 'pane',
      pidFile: this.makePidFile(paneId),
      status: 'registered',
    })
    return { paneId, isFirstTeammate }
  }

  async createTeammateWindowInSwarmView(
    name: string,
    _color: AgentColorName,
  ): Promise<CreatePaneResult & { windowName: string }> {
    const paneId = `wt-${randomUUID()}`
    const windowName = `teammate-${name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`
    this.panes.set(paneId, {
      title: name,
      mode: 'window',
      pidFile: this.makePidFile(paneId),
      status: 'registered',
    })
    return { paneId, isFirstTeammate: false, windowName }
  }

  async sendCommandToPane(
    paneId: PaneId,
    command: string,
    _useExternalSession?: boolean,
  ): Promise<void> {
    const pane = this.panes.get(paneId)
    if (!pane) {
      throw new Error(`Unknown Windows Terminal pane id: ${paneId}`)
    }

    // 拒绝 ready 态重 spawn（避免同 pidFile 双进程竞争）
    if (pane.status === 'ready' || pane.status === 'killing') {
      throw new Error(
        `Pane ${paneId} already spawned (status=${pane.status}); create a new pane to re-launch`,
      )
    }
    if (pane.status === 'spawning') {
      throw new Error(
        `Pane ${paneId} is currently spawning; wait for the in-flight launch to complete`,
      )
    }
    if (pane.status === 'dead') {
      throw new Error(`Pane ${paneId} is dead; create a new pane`)
    }
    // pane.status === 'registered' → 继续

    // 提前赋值 spawnPromise 在任何 await 前（inner Promise 包装）
    // Attach a no-op .catch() immediately to prevent unhandled rejection warnings
    // in case killPane never awaits spawnPromise (e.g. sendCommandToPane fails
    // before killPane is called).
    let resolveSpawn!: () => void
    let rejectSpawn!: (err: unknown) => void
    const spawnPromise = new Promise<void>((res, rej) => {
      resolveSpawn = res
      rejectSpawn = rej
    })
    // Silence unhandled-rejection: killPane may .catch() this later, but if
    // the pane dies before any kill is attempted, the rejection must not leak.
    spawnPromise.catch(() => {})
    pane.status = 'spawning'
    pane.spawnPromise = spawnPromise

    try {
      const launcher = wrapPowerShellCommand(command, pane.pidFile)
      // wt.exe treats ';' as its own command separator, which breaks
      // multi-statement PowerShell commands passed via -Command. Encode the
      // entire script as Base64 UTF-16LE and use -EncodedCommand instead.
      const encoded = Buffer.from(launcher, 'utf16le').toString('base64')
      const args =
        pane.mode === 'window'
          ? ['-w', '-1', 'new-tab', '--title', pane.title]
          : ['-w', '0', 'split-pane', '--vertical', '--title', pane.title]

      await unlink(pane.pidFile).catch(() => {})

      const result = await this.runCommand('wt.exe', [
        ...args,
        'powershell.exe',
        '-NoLogo',
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-EncodedCommand',
        encoded,
      ])

      if (result.code !== 0) {
        throw new Error(
          `Failed to launch Windows Terminal teammate ${paneId}: ${result.stderr}`,
        )
      }

      const timeoutMs = getWtPaneTimeoutMs()
      let pid: number
      try {
        pid = await waitForPidFile(pane.pidFile, timeoutMs)
      } catch (err) {
        throw new Error(
          `Windows Terminal pane failed to launch within ${timeoutMs}ms\n` +
            `  paneId: ${paneId}\n` +
            `  pidFile: ${pane.pidFile}\n` +
            `  wt.exe stdout: ${result.stdout || '(empty)'}\n` +
            `  wt.exe stderr: ${result.stderr || '(empty)'}\n` +
            `  underlying: ${err instanceof Error ? err.message : String(err)}\n` +
            `  override timeout via env CLAUDE_WT_PANE_TIMEOUT_MS`,
        )
      }

      pane.pid = pid
      pane.status = 'ready'
      resolveSpawn()
    } catch (err) {
      pane.status = 'dead'
      pane.pid = undefined
      rejectSpawn(err)
      throw err
    } finally {
      pane.spawnPromise = undefined
    }
  }

  async setPaneBorderColor(
    _paneId: PaneId,
    _color: AgentColorName,
    _useExternalSession?: boolean,
  ): Promise<void> {
    // Windows Terminal does not expose per-pane border colors through wt.exe.
  }

  async setPaneTitle(
    _paneId: PaneId,
    _name: string,
    _color: AgentColorName,
    _useExternalSession?: boolean,
  ): Promise<void> {
    // Title is passed at launch in sendCommandToPane.
  }

  async enablePaneBorderStatus(
    _windowTarget?: string,
    _useExternalSession?: boolean,
  ): Promise<void> {
    // Not supported by Windows Terminal's wt.exe surface.
  }

  async rebalancePanes(
    _windowTarget: string,
    _hasLeader: boolean,
  ): Promise<void> {
    // Windows Terminal handles split layout itself.
  }

  async killPane(
    paneId: PaneId,
    _useExternalSession?: boolean,
  ): Promise<boolean> {
    const pane = this.panes.get(paneId)
    if (!pane) {
      return false
    }

    // 1. 解 kill-while-spawn race：await spawn 完成（不论成功失败）
    if (pane.status === 'spawning' && pane.spawnPromise) {
      await pane.spawnPromise.catch(() => {})
    }

    // 2. TOCTOU 修正：重读 status/pid
    if (pane.status === 'dead') {
      this.panes.delete(paneId)
      return false
    }
    if (pane.status !== 'ready') {
      // 还在其它非终态（理论不可达，保险）
      return false
    }

    pane.status = 'killing'

    // 3. 优先用缓存 pid
    let pid: number | undefined = pane.pid

    // 4. fallback：缓存没有则读盘（保留 retry 3×500ms）
    if (pid === undefined) {
      let pidContent: string | null = null
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          pidContent = (await readFile(pane.pidFile, 'utf-8')).trim()
          break
        } catch {
          if (attempt === 2) {
            pane.status = 'dead'
            this.panes.delete(paneId)
            return false
          }
          await new Promise(r => setTimeout(r, 500))
        }
      }
      if (!pidContent || !/^\d+$/.test(pidContent)) {
        pane.status = 'dead'
        this.panes.delete(paneId)
        return false
      }
      const parsed = Number.parseInt(pidContent, 10)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        pane.status = 'dead'
        this.panes.delete(paneId)
        return false
      }
      pid = parsed
    }

    // 5. 执行 Stop-Process
    const result = await this.runCommand('powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-Command',
      `Stop-Process -Id ${pid} -Force -ErrorAction Stop`,
    ])

    // 6. 不管成功失败都清缓存 + 标 dead + 从 map 删（防 PID 复用误杀）
    pane.pid = undefined
    pane.status = 'dead'
    this.panes.delete(paneId)

    logForDebugging(
      `[WindowsTerminalBackend] killPane ${paneId} pid=${pid} code=${result.code}`,
    )
    return result.code === 0
  }

  async hidePane(
    _paneId: PaneId,
    _useExternalSession?: boolean,
  ): Promise<boolean> {
    return false
  }

  async showPane(
    _paneId: PaneId,
    _targetWindowOrPane: string,
    _useExternalSession?: boolean,
  ): Promise<boolean> {
    return false
  }
}

// Register the backend with the registry when this module is imported.
// This side effect is intentional - the registry needs backends to self-register.
// eslint-disable-next-line custom-rules/no-top-level-side-effects
registerWindowsTerminalBackend(WindowsTerminalBackend)
