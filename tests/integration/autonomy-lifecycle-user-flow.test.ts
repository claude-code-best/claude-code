// Why we use the BUILT bundle instead of src/entrypoints/cli.tsx:
// `Bun.spawn` runs the CLI in a fresh process whose cwd is the per-test
// tempDir. Bun resolves the `src/*` tsconfig path alias from the cwd's
// nearest tsconfig.json, NOT from the entrypoint file's directory — so a
// subprocess started with cwd=tempDir cannot resolve `import 'src/bootstrap/
// state.js'`. The built dist/cli.js has all aliases pre-resolved, which
// makes it usable from any cwd.
//
// CI runs `bun test` BEFORE `bun run build`, so we lazy-build cli.tsx in a
// `beforeAll` if dist/cli.js is missing. Local runs after `bun run build`
// just see the file and skip the build.
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  resetStateForTests,
  setOriginalCwd,
  setProjectRoot,
} from '../../src/bootstrap/state'
import {
  listAutonomyRuns,
  startManagedAutonomyFlowFromHeartbeatTask,
} from '../../src/utils/autonomyRuns'
import { listAutonomyFlows } from '../../src/utils/autonomyFlows'

const CLI_ENTRYPOINT = resolve(import.meta.dir, '../../dist/cli.js')
const PROJECT_ROOT = resolve(import.meta.dir, '../..')

let tempDir = ''
let configDir = ''
let previousConfigDir: string | undefined

async function ensureCliBundle(): Promise<void> {
  if (existsSync(CLI_ENTRYPOINT)) return
  const proc = Bun.spawn({
    cmd: [process.execPath, 'run', 'build'],
    cwd: PROJECT_ROOT,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stderr, exitCode] = await Promise.all([
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (exitCode !== 0 || !existsSync(CLI_ENTRYPOINT)) {
    throw new Error(
      `Failed to build dist/cli.js for autonomy CLI tests (exit=${exitCode}):\n${stderr}`,
    )
  }
}

beforeAll(async () => {
  await ensureCliBundle()
}, 120_000)

async function runAutonomyCli(args: string[]): Promise<string> {
  const proc = Bun.spawn({
    cmd: [process.execPath, CLI_ENTRYPOINT, 'autonomy', ...args],
    cwd: tempDir,
    env: {
      ...process.env,
      CLAUDE_CONFIG_DIR: configDir,
      CI: 'true',
      GITHUB_ACTIONS: 'true',
      NODE_ENV: 'development',
      NO_COLOR: '1',
    },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])

  expect(stderr, `unexpected stderr output:\n${stderr}`).toBe('')
  expect(exitCode, `non-zero exit ${exitCode}; stderr:\n${stderr}`).toBe(0)
  return stdout
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'autonomy-user-flow-'))
  configDir = join(tempDir, 'config')
  previousConfigDir = process.env.CLAUDE_CONFIG_DIR
  process.env.CLAUDE_CONFIG_DIR = configDir
  resetStateForTests()
  setOriginalCwd(tempDir)
  setProjectRoot(tempDir)
})

afterEach(() => {
  resetStateForTests()
  if (previousConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = previousConfigDir
  }
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true })
  }
})

describe('autonomy lifecycle user-equivalent CLI flow', () => {
  test('status --deep works from a clean project without creating autonomy state', async () => {
    const output = await runAutonomyCli(['status', '--deep'])

    expect(output).toContain('# Autonomy Deep Status')
    expect(output).toContain('Autonomy runs: 0')
    expect(output).toContain('Autonomy flows: 0')
    expect(existsSync(join(tempDir, '.claude', 'autonomy', 'runs.json'))).toBe(
      false,
    )
    expect(existsSync(join(tempDir, '.claude', 'autonomy', 'flows.json'))).toBe(
      false,
    )
  })

  test('real CLI can inspect, resume, and cancel a persisted managed flow', async () => {
    await startManagedAutonomyFlowFromHeartbeatTask({
      rootDir: tempDir,
      currentDir: tempDir,
      task: {
        name: 'manual-user-flow',
        interval: '1h',
        prompt: 'Manual lifecycle acceptance',
        steps: [
          {
            name: 'approve',
            prompt: 'Wait for manual approval',
            waitFor: 'manual',
          },
          {
            name: 'execute',
            prompt: 'Execute approved work',
          },
        ],
      },
    })
    const [waitingFlow] = await listAutonomyFlows(tempDir)
    expect(waitingFlow?.status).toBe('waiting')

    const status = await runAutonomyCli(['status', '--deep'])
    expect(status).toContain('Autonomy flows: 1')
    expect(status).toContain('Waiting: 1')

    const flows = await runAutonomyCli(['flows', '5'])
    expect(flows).toContain(waitingFlow!.flowId)
    expect(flows).toContain('waiting')

    const detailBefore = await runAutonomyCli(['flow', waitingFlow!.flowId])
    expect(detailBefore).toContain('Status: waiting')
    expect(detailBefore).toContain('Current step: approve')

    const resume = await runAutonomyCli(['flow', 'resume', waitingFlow!.flowId])
    expect(resume).toContain('Prepared the next managed step')
    expect(resume).toContain('Prompt:')

    const detailAfterResume = await runAutonomyCli([
      'flow',
      waitingFlow!.flowId,
    ])
    expect(detailAfterResume).toContain('Status: queued')
    expect(detailAfterResume).toContain('Latest run:')

    const cancel = await runAutonomyCli(['flow', 'cancel', waitingFlow!.flowId])
    expect(cancel).toContain('Cancelled flow')

    const [cancelledRun] = await listAutonomyRuns(tempDir)
    const [cancelledFlow] = await listAutonomyFlows(tempDir)
    expect(cancelledRun?.status).toBe('cancelled')
    expect(cancelledFlow?.status).toBe('cancelled')

    const detailAfterCancel = await runAutonomyCli([
      'flow',
      waitingFlow!.flowId,
    ])
    expect(detailAfterCancel).toContain('Status: cancelled')
  }, 30000)
})
