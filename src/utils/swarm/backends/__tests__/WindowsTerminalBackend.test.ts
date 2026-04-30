import { mkdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeEach, afterEach, describe, expect, test } from 'bun:test'
import { WindowsTerminalBackend } from '../WindowsTerminalBackend'

type Call = { command: string; args: string[] }

let tempDir: string

beforeEach(async () => {
  tempDir = join(
    tmpdir(),
    `windows-terminal-backend-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  )
  await mkdir(tempDir, { recursive: true })
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

function createBackend(calls: Call[]): WindowsTerminalBackend {
  return new WindowsTerminalBackend(
    async (command, args) => {
      calls.push({ command, args })
      return { stdout: 'ok', stderr: '', code: 0 }
    },
    () => 'windows',
  )
}

function decodeEncodedCommand(call: Call): {
  args: string[]
  decodedLauncher: string
} {
  expect(call.command).toBe('wt.exe')
  const encIdx = call.args.indexOf('-EncodedCommand')
  expect(encIdx).toBeGreaterThanOrEqual(0)
  const encoded = call.args[encIdx + 1]!
  const decodedLauncher = Buffer.from(encoded, 'base64').toString('utf16le')
  return { args: call.args, decodedLauncher }
}

describe('WindowsTerminalBackend', () => {
  test('launches split panes through wt.exe with a wrapped PowerShell command', async () => {
    const calls: Call[] = []
    const backend = createBackend(calls)
    const pane = await backend.createTeammatePaneInSwarmView('worker', 'blue')

    await backend.sendCommandToPane(
      pane.paneId,
      "Set-Location -LiteralPath 'C:\\repo'; & 'claude.exe' '--agent-id' 'worker@alpha'",
    )

    expect(calls).toHaveLength(1)
    const { args, decodedLauncher } = decodeEncodedCommand(calls[0]!)
    expect(args).toContain('split-pane')
    expect(args).toContain('--vertical')
    expect(args).toContain('--title')
    expect(args).toContain('worker')
    expect(decodedLauncher).toContain('Set-Content -LiteralPath')
    expect(decodedLauncher).toContain('claude.exe')
  })

  test('preserves use_splitpane false as a separate Windows Terminal window', async () => {
    const calls: Call[] = []
    const backend = createBackend(calls)
    const pane = await backend.createTeammateWindowInSwarmView(
      'reviewer',
      'cyan',
    )

    await backend.sendCommandToPane(pane.paneId, "Write-Output 'hello'")

    expect(pane.windowName).toBe('teammate-reviewer')
    const { args } = decodeEncodedCommand(calls[0]!)
    expect(args.join(' ')).toContain('-w -1 new-tab --title')
  })

  test('force kills the recorded teammate shell pid when available', async () => {
    const calls: Call[] = []
    const backend = createBackend(calls)
    const pane = await backend.createTeammatePaneInSwarmView('killer', 'red')

    await backend.sendCommandToPane(pane.paneId, "Write-Output 'running'")
    const { decodedLauncher } = decodeEncodedCommand(calls[0]!)
    const pidFile = decodedLauncher.match(
      /Set-Content -LiteralPath '([^']+)'/,
    )?.[1]
    expect(pidFile).toBeString()
    await writeFile(pidFile!, '12345', 'utf-8')

    const killed = await backend.killPane(pane.paneId)

    expect(killed).toBe(true)
    expect(calls[calls.length - 1]!.command).toBe('powershell.exe')
    expect(calls[calls.length - 1]!.args.join(' ')).toContain(
      'Stop-Process -Id 12345',
    )
  })
})
