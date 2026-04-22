import { randomUUID } from 'crypto'
import { readFile } from 'fs/promises'
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

type WindowsTerminalPane = {
  title: string
  mode: 'pane' | 'window'
  pidFile: string
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

function makePidFile(paneId: string): string {
  return join(tmpdir(), `${paneId.replace(/[^a-zA-Z0-9_-]/g, '-')}.pid`)
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

  constructor(
    private readonly runCommand: CommandRunner = execFileNoThrow,
    private readonly getPlatformValue: () => Platform = getPlatform,
  ) {}

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
      pidFile: makePidFile(paneId),
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
      pidFile: makePidFile(paneId),
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

    const launcher = wrapPowerShellCommand(command, pane.pidFile)
    // wt.exe treats ';' as its own command separator, which breaks
    // multi-statement PowerShell commands passed via -Command. Encode the
    // entire script as Base64 UTF-16LE and use -EncodedCommand instead.
    const encoded = Buffer.from(launcher, 'utf16le').toString('base64')
    const args =
      pane.mode === 'window'
        ? ['-w', '-1', 'new-tab', '--title', pane.title]
        : ['-w', '0', 'split-pane', '--vertical', '--title', pane.title]

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

    let pid: number
    try {
      pid = Number.parseInt((await readFile(pane.pidFile, 'utf-8')).trim(), 10)
    } catch {
      this.panes.delete(paneId)
      return false
    }

    if (!Number.isFinite(pid)) {
      this.panes.delete(paneId)
      return false
    }

    const result = await this.runCommand('powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-Command',
      `Stop-Process -Id ${pid} -Force -ErrorAction Stop`,
    ])
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
