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
  process.env.CLAUDE_WT_PANE_TIMEOUT_MS = '2000'
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
  delete process.env.CLAUDE_WT_PANE_TIMEOUT_MS
})

function createBackend(
  calls: Call[],
  opts: { simulatePidWrite?: boolean | number } = {},
): WindowsTerminalBackend {
  const simulate = opts.simulatePidWrite !== false
  const delayMs =
    typeof opts.simulatePidWrite === 'number' ? opts.simulatePidWrite : 30
  return new WindowsTerminalBackend({
    runCommand: async (command, args) => {
      calls.push({ command, args })
      if (simulate && command === 'wt.exe') {
        const encIdx = args.indexOf('-EncodedCommand')
        if (encIdx >= 0) {
          const decoded = Buffer.from(args[encIdx + 1]!, 'base64').toString(
            'utf16le',
          )
          const match = decoded.match(/Set-Content -LiteralPath '([^']+)'/)
          if (match) {
            setTimeout(() => {
              writeFile(match[1]!, '54321', 'utf-8').catch(() => {})
            }, delayMs)
          }
        }
      }
      return { stdout: 'ok', stderr: '', code: 0 }
    },
    getPlatform: () => 'windows',
    pidFileDir: tempDir,
  })
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

  test('force kills the cached pid from sendCommandToPane without reading pidFile', async () => {
    const calls: Call[] = []
    const backend = createBackend(calls)
    const pane = await backend.createTeammatePaneInSwarmView('killer', 'red')

    // sendCommandToPane resolves — simulate writes '54321' to pidFile, which
    // becomes pane.pid. killPane should use the cached pid, not re-read the file.
    await backend.sendCommandToPane(pane.paneId, "Write-Output 'running'")

    const killed = await backend.killPane(pane.paneId)

    expect(killed).toBe(true)
    expect(calls[calls.length - 1]!.command).toBe('powershell.exe')
    expect(calls[calls.length - 1]!.args.join(' ')).toContain(
      'Stop-Process -Id 54321',
    )
  })

  test('throws a diagnostic error when pidFile never appears within timeout', async () => {
    process.env.CLAUDE_WT_PANE_TIMEOUT_MS = '300'
    const calls: Call[] = []
    const backend = createBackend(calls, { simulatePidWrite: false })
    const pane = await backend.createTeammatePaneInSwarmView('slowpane', 'blue')
    let caught: unknown
    try {
      await backend.sendCommandToPane(pane.paneId, "Write-Output 'x'")
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toMatch(
      /Windows Terminal pane failed to launch within 300ms/,
    )
  })

  test('error message includes paneId pidFile and override hint', async () => {
    process.env.CLAUDE_WT_PANE_TIMEOUT_MS = '250'
    const calls: Call[] = []
    const backend = createBackend(calls, { simulatePidWrite: false })
    const pane = await backend.createTeammatePaneInSwarmView(
      'diagpane',
      'green',
    )
    let caught: unknown
    try {
      await backend.sendCommandToPane(pane.paneId, "Write-Output 'x'")
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(Error)
    const msg = (caught as Error).message
    expect(msg).toContain(pane.paneId)
    expect(msg).toContain('CLAUDE_WT_PANE_TIMEOUT_MS')
  })

  test('unlinks stale pidFile so a stale pid is not adopted', async () => {
    const calls: Call[] = []
    const backend = createBackend(calls, { simulatePidWrite: 30 })
    const pane = await backend.createTeammatePaneInSwarmView('stale', 'pink')
    // pidFile path is deterministic: <tempDir>/<sanitized paneId>.pid
    const stalePidFile = join(
      tempDir,
      `${pane.paneId.replace(/[^a-zA-Z0-9_-]/g, '-')}.pid`,
    )
    // Pre-seed stale content. If sendCommandToPane did NOT unlink, waitForPidFile
    // would immediately accept '99999' and cache it as pane.pid. With unlink,
    // simulate's '54321' is the value killPane sees.
    await writeFile(stalePidFile, '99999', 'utf-8')

    await backend.sendCommandToPane(pane.paneId, "Write-Output 'x'")
    const killed = await backend.killPane(pane.paneId)
    expect(killed).toBe(true)
    expect(calls[calls.length - 1]!.args.join(' ')).toContain(
      'Stop-Process -Id 54321',
    )
  })

  test('rejects re-spawn on a ready pane', async () => {
    const calls: Call[] = []
    const backend = createBackend(calls)
    const pane = await backend.createTeammatePaneInSwarmView('reentry', 'cyan')
    await backend.sendCommandToPane(pane.paneId, "Write-Output 'first'")
    // pane.status === 'ready' now. Second sendCommandToPane must throw.
    let caught: unknown
    try {
      await backend.sendCommandToPane(pane.paneId, "Write-Output 'second'")
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toMatch(/already spawned/)
  })

  test('throws on unknown paneId in sendCommandToPane', async () => {
    const calls: Call[] = []
    const backend = createBackend(calls)
    let caught: unknown
    try {
      await backend.sendCommandToPane('wt-nonexistent', "Write-Output 'x'")
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toContain('Unknown Windows Terminal pane')
  })

  test('rejects corrupted pidFile content ("123abc") and times out', async () => {
    process.env.CLAUDE_WT_PANE_TIMEOUT_MS = '400'
    const calls: Call[] = []
    // Custom runner writes invalid pid content (not all digits).
    const backend = new WindowsTerminalBackend({
      runCommand: async (command, args) => {
        calls.push({ command, args })
        if (command === 'wt.exe') {
          const encIdx = args.indexOf('-EncodedCommand')
          if (encIdx >= 0) {
            const decoded = Buffer.from(args[encIdx + 1]!, 'base64').toString(
              'utf16le',
            )
            const match = decoded.match(/Set-Content -LiteralPath '([^']+)'/)
            if (match) {
              setTimeout(() => {
                writeFile(match[1]!, '123abc', 'utf-8').catch(() => {})
              }, 30)
            }
          }
        }
        return { stdout: 'ok', stderr: '', code: 0 }
      },
      getPlatform: () => 'windows',
      pidFileDir: tempDir,
    })
    const pane = await backend.createTeammatePaneInSwarmView('corrupt', 'red')
    let caught: unknown
    try {
      await backend.sendCommandToPane(pane.paneId, "Write-Output 'x'")
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(Error)
    // Inner error from waitForPidFile must reach the wrapped diagnostic message.
    const msg = (caught as Error).message
    expect(msg).toMatch(/failed to launch within 400ms/)
    expect(msg).toMatch(/not a valid pid|invalid pid|123abc/)
  })

  test('killPane awaits in-flight spawn before killing (kill-while-spawn race)', async () => {
    // simulatePidWrite: 800ms — sendCommandToPane stays in waitForPidFile for ~800ms.
    process.env.CLAUDE_WT_PANE_TIMEOUT_MS = '3000'
    const calls: Call[] = []
    const backend = createBackend(calls, { simulatePidWrite: 800 })
    const pane = await backend.createTeammatePaneInSwarmView('racy', 'blue')

    // Start spawn but don't await it yet.
    const spawnP = backend.sendCommandToPane(pane.paneId, "Write-Output 'x'")
    // 50ms later, call killPane — pane is still 'spawning', killPane must
    // await spawnPromise (which resolves at ~800ms when simulate writes pid 54321),
    // then kill using the cached pid.
    await new Promise(r => setTimeout(r, 50))
    const killP = backend.killPane(pane.paneId)

    // Both must resolve cleanly.
    await spawnP
    const killed = await killP
    expect(killed).toBe(true)
    // The kill must target the freshly-spawned pid (54321), not have used a
    // stale-or-missing fallback path.
    const killCall = calls[calls.length - 1]!
    expect(killCall.command).toBe('powershell.exe')
    expect(killCall.args.join(' ')).toContain('Stop-Process -Id 54321')
  })

  test('Stop-Process failure clears cached pid and marks pane dead', async () => {
    const calls: Call[] = []
    // Runner returns code 1 only for powershell.exe (kill); wt.exe succeeds.
    const backend = new WindowsTerminalBackend({
      runCommand: async (command, args) => {
        calls.push({ command, args })
        if (command === 'wt.exe') {
          const encIdx = args.indexOf('-EncodedCommand')
          if (encIdx >= 0) {
            const decoded = Buffer.from(args[encIdx + 1]!, 'base64').toString(
              'utf16le',
            )
            const match = decoded.match(/Set-Content -LiteralPath '([^']+)'/)
            if (match) {
              setTimeout(() => {
                writeFile(match[1]!, '54321', 'utf-8').catch(() => {})
              }, 30)
            }
          }
          return { stdout: 'ok', stderr: '', code: 0 }
        }
        // powershell Stop-Process fails
        return { stdout: '', stderr: 'access denied', code: 1 }
      },
      getPlatform: () => 'windows',
      pidFileDir: tempDir,
    })
    const pane = await backend.createTeammatePaneInSwarmView('dier', 'orange')
    await backend.sendCommandToPane(pane.paneId, "Write-Output 'x'")

    const killed = await backend.killPane(pane.paneId)
    expect(killed).toBe(false) // Stop-Process exit 1 → false

    // After kill failure, pane is removed from map: second killPane → false (not retry).
    const killedAgain = await backend.killPane(pane.paneId)
    expect(killedAgain).toBe(false)
    // Critically: only ONE powershell call happened — the second killPane returned
    // false from "pane not in map", not from another Stop-Process attempt.
    const psCalls = calls.filter(c => c.command === 'powershell.exe')
    expect(psCalls.length).toBe(1)
  })

  test('killPane uses cached pid and returns false when pane is unknown', async () => {
    const calls: Call[] = []
    const backend = createBackend(calls, { simulatePidWrite: 30 })
    const pane = await backend.createTeammatePaneInSwarmView('cached', 'yellow')
    await backend.sendCommandToPane(pane.paneId, "Write-Output 'x'")

    // After sendCommandToPane, pane.pid = 54321 (from simulate). killPane must
    // use this cached pid without reading the pidFile at all.
    const killed = await backend.killPane(pane.paneId)
    expect(killed).toBe(true)
    expect(calls[calls.length - 1]!.args.join(' ')).toContain(
      'Stop-Process -Id 54321',
    )

    // After kill, pane is removed — a second killPane must return false.
    const killedAgain = await backend.killPane(pane.paneId)
    expect(killedAgain).toBe(false)
  })
})
