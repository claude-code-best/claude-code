import { createHash } from 'node:crypto'
import { applyCompatRule } from '../providerRegistry/providerCompatMatrix.js'
import type {
  CompatRule,
  ProviderConfigurationV2,
} from '../providerRegistry/types.js'
import {
  projectRuntimeEnvironment,
  resolveProviderRuntimeSnapshot,
} from './resolveSnapshot.js'
import {
  ProviderRuntimeResolutionError,
  type ProviderRuntimeSelection,
  type ProviderRuntimeSnapshot,
} from './types.js'
import type { APIProvider } from '../../utils/model/providers.js'

export type RuntimeTurnState = 'idle' | 'running'

export type RuntimeActivationErrorCode =
  | ProviderRuntimeResolutionError['code']
  | 'runtime_busy'
  | 'runtime_operation_conflict'
  | 'endpoint_unreachable'
  | 'activation_failed'

export type RuntimeActivationResult =
  | { ok: true; snapshot: ProviderRuntimeSnapshot }
  | { ok: false; code: RuntimeActivationErrorCode }

export type RuntimeActivationOptions = {
  operationId: string
  turnState: RuntimeTurnState
}

export type ProviderRuntimeDependencies = {
  loadConfiguration: () => ProviderConfigurationV2
  getEnvironment: () => Record<string, string | undefined>
  applyEnvironment: (environment: Record<string, string | undefined>) => void
  getProviderOverride: () => APIProvider | null
  setProviderOverride: (provider: APIProvider | null) => void
  clearDerivedCaches: () => void | Promise<void>
  validateClient: (snapshot: ProviderRuntimeSnapshot) => Promise<void>
  isModelAllowed: (model: string) => boolean
}

type OperationResult = {
  digest: string
  result: RuntimeActivationResult
}

let activeProviderRuntimeSnapshot: ProviderRuntimeSnapshot | null = null

export function getActiveProviderRuntimeSnapshot(): ProviderRuntimeSnapshot | null {
  return activeProviderRuntimeSnapshot
}

export function getActiveCompatRule(): CompatRule | undefined {
  return activeProviderRuntimeSnapshot?.compatRule
}

export function applyProviderRuntimeCompatRule<T extends object>(
  body: T,
  rule: CompatRule = getActiveCompatRule() ?? 'permissive',
): T {
  return applyCompatRule(
    body as unknown as Record<string, unknown>,
    rule,
  ) as unknown as T
}

/** Clear only provider-derived caches that exist in this process. */
export async function clearProviderDerivedCaches(): Promise<void> {
  const [openAI, grok, modelStrings] = await Promise.all([
    import('../api/openai/client.js'),
    import('../api/grok/client.js'),
    import('../../utils/model/modelStrings.js'),
  ])
  openAI.clearOpenAIClientCache()
  grok.clearGrokClientCache()
  modelStrings.clearModelStringsCache()
}

function activationDigest(selection: ProviderRuntimeSelection): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        selection.providerId,
        selection.modelProfileId,
        selection.resolvedModelId,
        selection.providerConfigRevision,
      ]),
    )
    .digest('hex')
}

function cloneResult(result: RuntimeActivationResult): RuntimeActivationResult {
  return result.ok ? { ok: true, snapshot: result.snapshot } : { ...result }
}

export class ProviderRuntimeService {
  private active: ProviderRuntimeSnapshot | null = null
  private readonly operations = new Map<string, OperationResult>()

  constructor(
    private readonly dependencies: ProviderRuntimeDependencies,
    private readonly operationLimit = 256,
  ) {
    if (!Number.isInteger(operationLimit) || operationLimit < 1) {
      throw new RangeError('operationLimit must be a positive integer')
    }
  }

  current(): ProviderRuntimeSnapshot | null {
    return this.active
  }

  async activate(
    selection: ProviderRuntimeSelection,
    options: RuntimeActivationOptions,
  ): Promise<RuntimeActivationResult> {
    const operationId = options.operationId.trim()
    if (!operationId) return { ok: false, code: 'activation_failed' }
    const digest = activationDigest(selection)
    const cached = this.operations.get(operationId)
    if (cached !== undefined) {
      return cached.digest === digest
        ? cloneResult(cached.result)
        : { ok: false, code: 'runtime_operation_conflict' }
    }
    if (options.turnState !== 'idle') {
      return { ok: false, code: 'runtime_busy' }
    }

    const oldSnapshot = this.active
    const oldPublishedSnapshot = activeProviderRuntimeSnapshot
    const oldEnvironment = this.dependencies.getEnvironment()
    const oldOverride = this.dependencies.getProviderOverride()
    let target: ProviderRuntimeSnapshot
    try {
      target = resolveProviderRuntimeSnapshot(
        this.dependencies.loadConfiguration(),
        selection,
        oldEnvironment,
        { isModelAllowed: this.dependencies.isModelAllowed },
      )
    } catch (error) {
      const result: RuntimeActivationResult = {
        ok: false,
        code:
          error instanceof ProviderRuntimeResolutionError
            ? error.code
            : 'activation_failed',
      }
      this.remember(operationId, digest, result)
      return result
    }

    const targetEnvironment = projectRuntimeEnvironment(target, oldEnvironment)
    let validationStarted = false
    try {
      this.dependencies.applyEnvironment(targetEnvironment)
      this.dependencies.setProviderOverride(target.apiProvider)
      await this.dependencies.clearDerivedCaches()
      validationStarted = true
      await this.dependencies.validateClient(target)

      this.active = target
      activeProviderRuntimeSnapshot = target
      const result: RuntimeActivationResult = { ok: true, snapshot: target }
      this.remember(operationId, digest, result)
      return result
    } catch {
      try {
        this.dependencies.applyEnvironment(oldEnvironment)
      } catch {
        // Continue restoring the remaining independent runtime surfaces.
      }
      try {
        this.dependencies.setProviderOverride(oldOverride)
      } catch {
        // Continue restoring the remaining independent runtime surfaces.
      }
      try {
        await this.dependencies.clearDerivedCaches()
      } catch {
        // The old snapshot still remains authoritative when cache reset fails.
      }
      this.active = oldSnapshot
      activeProviderRuntimeSnapshot = oldPublishedSnapshot
      const result: RuntimeActivationResult = {
        ok: false,
        code: validationStarted ? 'endpoint_unreachable' : 'activation_failed',
      }
      this.remember(operationId, digest, result)
      return result
    }
  }

  private remember(
    operationId: string,
    digest: string,
    result: RuntimeActivationResult,
  ): void {
    if (this.operations.size >= this.operationLimit) {
      const oldest = this.operations.keys().next().value
      if (oldest !== undefined) this.operations.delete(oldest)
    }
    this.operations.set(operationId, { digest, result: cloneResult(result) })
  }
}
