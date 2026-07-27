import type { StackConfig } from './config.js'
import { join } from 'node:path'
import { needsProductionWebBuild } from './config.js'

export type ChildName = 'web-build' | 'rcs' | 'web' | 'worker'

export interface SpawnRequest {
  name: ChildName
  argv: string[]
  cwd: string
  env: Record<string, string | undefined>
}

export interface ChildExit {
  code: number
  signal: NodeJS.Signals | null
}

export interface ManagedChild {
  name: ChildName
  exited: Promise<ChildExit>
  exit: ChildExit | null
  kill(signal: NodeJS.Signals): void
}

export interface StackDependencies {
  rootDir: string
  bunExecutable: string
  distExists(): Promise<boolean>
  spawn(request: SpawnRequest): ManagedChild
  isHealthy(url: string): Promise<boolean>
  /** Optional stronger readiness probe (RCS + registered control lane). */
  isReady?(url: string): Promise<boolean>
  delay(milliseconds: number): Promise<void>
  now(): number
  signal: Promise<NodeJS.Signals>
  log(message: string): void
  healthTimeoutMs: number
  healthPollMs: number
  shutdownGraceMs: number
}

export interface StackExit {
  reason: 'signal' | 'child-exit' | 'startup-failure'
  exitCode: number
}

export async function runStack(
  config: StackConfig,
  dependencies: StackDependencies,
): Promise<StackExit> {
  const managed: ManagedChild[] = []
  const rcsPackageDir = join(
    dependencies.rootDir,
    'packages/remote-control-server',
  )
  const spawn = (
    name: ChildName,
    argv: string[],
    cwd: string,
    env: Record<string, string | undefined>,
  ): ManagedChild => {
    const child = dependencies.spawn({ name, argv, cwd, env })
    if (name !== 'web-build') managed.push(child)
    return child
  }

  try {
    const distExists = await dependencies.distExists()
    if (needsProductionWebBuild(config.mode, distExists)) {
      dependencies.log('[stack] Web assets missing; building once')
      const build = spawn(
        'web-build',
        [dependencies.bunExecutable, 'run', 'build:web'],
        rcsPackageDir,
        {},
      )
      const buildExit = await build.exited
      if (buildExit.code !== 0) {
        dependencies.log(`[stack] Web build failed (${buildExit.code})`)
        return { reason: 'startup-failure', exitCode: buildExit.code || 1 }
      }
    }

    const rcs = spawn(
      'rcs',
      [dependencies.bunExecutable, 'run', 'scripts/rcs.ts'],
      dependencies.rootDir,
      config.rcsEnv,
    )
    const healthy = await waitForHealth(config.healthUrl, rcs, dependencies)
    if (!healthy) {
      dependencies.log(
        `[stack] RCS did not become healthy within ${dependencies.healthTimeoutMs}ms`,
      )
      await terminateChildren(managed, dependencies)
      return { reason: 'startup-failure', exitCode: 1 }
    }

    if (config.mode === 'dev') {
      spawn(
        'web',
        [dependencies.bunExecutable, 'run', 'dev:web'],
        rcsPackageDir,
        {},
      )
    }
    const worker = spawn(
      'worker',
      [dependencies.bunExecutable, 'run', 'scripts/rcs-worker.ts'],
      dependencies.rootDir,
      {
        ...config.workerEnv,
        RCS_WORKER_DIR: dependencies.rootDir,
      },
    )

    // /health only proves that the HTTP process is alive.  Wait for the
    // worker's first control-lane poll before declaring the local stack ready;
    // otherwise the UI can immediately enqueue work into an unregistered
    // bridge and observe a misleading startup timeout.
    if (dependencies.isReady) {
      const ready = await waitForHealth(config.readyUrl, worker, {
        ...dependencies,
        isHealthy: dependencies.isReady,
      })
      if (!ready) {
        dependencies.log(
          `[stack] Bridge control lane did not become ready within ${dependencies.healthTimeoutMs}ms`,
        )
        await terminateChildren(managed, dependencies)
        return { reason: 'startup-failure', exitCode: 1 }
      }
    }

    const outcome = await Promise.race([
      dependencies.signal.then(signal => ({
        kind: 'signal' as const,
        signal,
      })),
      ...managed.map(child =>
        child.exited.then(exit => ({
          kind: 'child' as const,
          child,
          exit,
        })),
      ),
    ])
    await terminateChildren(managed, dependencies)

    if (outcome.kind === 'signal') {
      return {
        reason: 'signal',
        exitCode: outcome.signal === 'SIGINT' ? 130 : 143,
      }
    }
    dependencies.log(
      `[stack] ${outcome.child.name} exited unexpectedly (${outcome.exit.code})`,
    )
    return {
      reason: 'child-exit',
      exitCode: outcome.exit.code === 0 ? 1 : outcome.exit.code,
    }
  } catch (error) {
    dependencies.log(
      `[stack] startup failed: ${error instanceof Error ? error.message : String(error)}`,
    )
    await terminateChildren(managed, dependencies)
    return { reason: 'startup-failure', exitCode: 1 }
  }
}

async function waitForHealth(
  url: string,
  rcs: ManagedChild,
  dependencies: StackDependencies,
): Promise<boolean> {
  const deadline = dependencies.now() + dependencies.healthTimeoutMs
  while (true) {
    const result = await Promise.race([
      dependencies.isHealthy(url).then(healthy => ({
        type: 'health' as const,
        healthy,
      })),
      rcs.exited.then(() => ({ type: 'exit' as const, healthy: false })),
    ])
    if (result.type === 'exit') return false
    if (result.healthy) return true
    if (dependencies.now() >= deadline) return false
    await dependencies.delay(
      Math.min(dependencies.healthPollMs, deadline - dependencies.now()),
    )
  }
}

async function terminateChildren(
  children: ManagedChild[],
  dependencies: StackDependencies,
): Promise<void> {
  // Stop the bridge worker before RCS.  This lets it send its deregistration
  // and terminate active session children while the control plane is still
  // reachable.  The web process is stopped before RCS as well so no new work
  // is accepted during the drain window.
  const shutdownOrder: ChildName[] = ['worker', 'web', 'rcs', 'web-build']
  const running = children.filter(child => child.exit === null)
  for (const name of shutdownOrder) {
    const group = running.filter(
      child => child.name === name && child.exit === null,
    )
    if (group.length === 0) continue
    for (const child of group) {
      try {
        child.kill('SIGTERM')
      } catch {
        // The child may have exited between the state check and kill.
      }
    }
    await Promise.race([
      Promise.all(group.map(child => child.exited)),
      dependencies.delay(dependencies.shutdownGraceMs),
    ])
    for (const child of group) {
      if (child.exit !== null) continue
      try {
        child.kill('SIGKILL')
      } catch {
        // The child may have exited during the grace period.
      }
    }
  }
}
