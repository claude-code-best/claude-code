#!/usr/bin/env bun
import { resolve } from 'node:path'
import { resolveStackConfig, type StackMode } from './config.js'
import {
  runStack,
  type ChildExit,
  type ManagedChild,
  type SpawnRequest,
} from './supervisor.js'

const HEALTH_REQUEST_TIMEOUT_MS = 1_000

function parseMode(value: string | undefined): StackMode {
  if (value === 'local' || value === 'dev') return value
  throw new Error('Usage: bun run scripts/rcs-stack/main.ts <local|dev>')
}

function signalPromise(): Promise<NodeJS.Signals> {
  return new Promise(resolveSignal => {
    process.once('SIGINT', () => resolveSignal('SIGINT'))
    process.once('SIGTERM', () => resolveSignal('SIGTERM'))
  })
}

async function forwardLines(
  stream: ReadableStream<Uint8Array>,
  prefix: string,
  write: (line: string) => void,
): Promise<void> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    pending += decoder.decode(value, { stream: true })
    const lines = pending.split(/\r?\n/)
    pending = lines.pop() ?? ''
    for (const line of lines) write(`[${prefix}] ${line}`)
  }
  pending += decoder.decode()
  if (pending) write(`[${prefix}] ${pending}`)
}

function spawnManaged(request: SpawnRequest): ManagedChild {
  const child = Bun.spawn(request.argv, {
    cwd: request.cwd,
    env: { ...process.env, ...request.env },
    stdin: 'inherit',
    stdout: 'pipe',
    stderr: 'pipe',
  })
  let exit: ChildExit | null = null
  const prefix = request.name === 'web-build' ? 'web' : request.name
  void forwardLines(child.stdout, prefix, line => console.log(line))
  void forwardLines(child.stderr, prefix, line => console.error(line))
  const exited = child.exited.then(code => {
    exit = { code, signal: null }
    return exit
  })
  return {
    name: request.name,
    exited,
    get exit() {
      return exit
    },
    kill(signal) {
      child.kill(signal)
    },
  }
}

async function main(): Promise<void> {
  const mode = parseMode(process.argv[2])
  const rootDir = resolve(import.meta.dir, '../..')
  const config = resolveStackConfig(mode, process.env)
  console.log(
    `[stack] mode=${config.publicSummary.mode} rcs=${config.publicSummary.rcsUrl} web=${config.publicSummary.webUrl}`,
  )
  console.log(
    `[stack] transport keys=${config.publicSummary.apiKeyCount} source=${config.publicSummary.apiKeySource}`,
  )

  const result = await runStack(config, {
    rootDir,
    bunExecutable: process.execPath,
    distExists: () =>
      Bun.file(
        resolve(rootDir, 'packages/remote-control-server/web/dist/index.html'),
      ).exists(),
    spawn: spawnManaged,
    async isHealthy(url) {
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(HEALTH_REQUEST_TIMEOUT_MS),
        })
        return response.ok
      } catch {
        return false
      }
    },
    delay: milliseconds => Bun.sleep(milliseconds),
    now: Date.now,
    signal: signalPromise(),
    log: message => console.error(message),
    healthTimeoutMs: 15_000,
    healthPollMs: 200,
    shutdownGraceMs: 3_000,
  })
  process.exitCode = result.exitCode
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
