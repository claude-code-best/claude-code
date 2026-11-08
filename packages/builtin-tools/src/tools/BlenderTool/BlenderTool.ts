import { randomUUID } from 'node:crypto'
import { z } from 'zod/v4'
import { buildTool, type ToolDef } from 'src/Tool.js'
import { isEnvTruthy } from 'src/utils/envUtils.js'
import { lazySchema } from 'src/utils/lazySchema.js'
import {
  abortLock,
  applyStaged,
  beginLockFrom,
  BlenderBridge,
  BlenderScriptError,
  blenderStateOwner,
  blenderStatePath,
  cancelLock,
  clearStale,
  isActive,
  isStale,
  normalizeSelectionIds,
  readBlenderState,
  STALE_LOCK_MS,
  usesSharedBlenderStateFile,
  validateStagedScript,
  writeBlenderState,
  type BlenderState,
  type BlenderStatus,
} from 'src/services/blender/index.js'
import { DESCRIPTION, EDIT_DESCRIPTION, EDIT_PROMPT, PROMPT } from './prompt.js'

/**
 * Gated engine tools for a running Blender addon.
 *
 * `blender` is one tool with an action switch: status/scene/selection are
 * read-only, select/screenshot/export drive the addon, and exec is a trusted
 * bpy escape hatch. `edit_blender_selection` is the only path for a
 * model-invented edit: it validates a script against the locked object scope
 * and stages it, but never executes it. When the user clicks Apply, the desktop
 * runs the staged script from the state file and the mod clears the lock.
 */

export const BLENDER_TOOL_NAME = 'blender'
export const EDIT_BLENDER_SELECTION_TOOL_NAME = 'edit_blender_selection'

export const BLENDER_ACTIONS = [
  'status',
  'scene',
  'selection',
  'select',
  'screenshot',
  'export',
  'exec',
  'begin_edit',
  'apply_staged',
  'cancel_edit',
] as const
export type BlenderAction = (typeof BLENDER_ACTIONS)[number]

const SELECT_MODE_VALUES = ['OBJECT', 'EDIT', 'VERTEX', 'EDGE', 'FACE'] as const

/** One staged patch may not crowd out the session. */
export const MAX_SUMMARY_CHARS = 4 * 1024

export type BlenderToolErrorCode =
  | 'DISABLED'
  | 'INVALID_INPUT'
  | 'NO_LOCK'
  | 'FOREIGN_LOCK'
  | 'LOCK_MISMATCH'
  | 'LOCK_EXPIRED'
  | 'ALREADY_STAGED'
  | 'INVALID_SCRIPT'
  | 'TOO_LARGE'

/**
 * A rejection the mod can catch and act on. Every failure leaves the state file
 * exactly as it was; the mod owns clearing a dead lock.
 */
export class BlenderToolError extends Error {
  readonly code: BlenderToolErrorCode

  constructor(
    code: BlenderToolErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'BlenderToolError'
    this.code = code
  }
}

/**
 * Rejections the model can fix and resubmit under the same lock. The mod keeps
 * the lock for these; anything else (an expired lock, an aborted turn)
 * releases it.
 */
export const RETRYABLE_BLENDER_TOOL_ERRORS: ReadonlySet<BlenderToolErrorCode> =
  new Set(['INVALID_INPUT', 'INVALID_SCRIPT', 'TOO_LARGE', 'LOCK_MISMATCH'])

/**
 * Blender tools ship enabled so a fresh install works without extra setup.
 * Only an explicit falsey value opts out; an unset/blank flag means enabled.
 */
export function blenderEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.AUTOAGENT_BLENDER
  if (raw === undefined || raw.trim() === '') return true
  return isEnvTruthy(raw)
}

function assertEnabled(): void {
  if (!blenderEnabled()) {
    throw new BlenderToolError(
      'DISABLED',
      'Blender integration is disabled (AUTOAGENT_BLENDER=0). Unset it or set it to 1 to enable the blender tools.',
    )
  }
}

function fail(code: BlenderToolErrorCode, message: string): never {
  throw new BlenderToolError(code, message)
}

/* ------------------------------------------------------------------ */
/* Staged edit                                                         */
/* ------------------------------------------------------------------ */

export interface StageBlenderSelectionInput {
  lockId: string
  script: string
  summary?: string
}

export interface StageBlenderSelectionResult {
  previous: BlenderState
  state: BlenderState
}

/**
 * Validate a proposed bpy script against the active lock and stage it.
 *
 * Throws a `BlenderToolError` and writes nothing on every rejection: missing,
 * corrupt or idle state, a foreign shared file, a mismatched or expired lock,
 * an already staged patch, an oversized summary, or a script that fails
 * validation. The script is never executed here.
 */
export function stageBlenderSelection(
  input: StageBlenderSelectionInput,
  file = blenderStatePath(),
  now: () => number = Date.now,
): StageBlenderSelectionResult {
  const previous = readBlenderState(file)
  if (!previous || !isActive(previous)) {
    fail(
      'NO_LOCK',
      'edit_blender_selection: no Blender lock is active; ask the user to select objects and start an edit first',
    )
  }
  // An explicitly shared state file may belong to another engine process. Never
  // touch a lock this process does not own, even to reject it in place.
  if (
    usesSharedBlenderStateFile() &&
    previous.sessionId !== blenderStateOwner()
  ) {
    fail(
      'FOREIGN_LOCK',
      'edit_blender_selection: this Blender lock belongs to another session; ask the user to select objects in this session',
    )
  }
  if (input.lockId !== previous.lockId) {
    fail(
      'LOCK_MISMATCH',
      `edit_blender_selection: lockId "${input.lockId}" does not match the active Blender lock`,
    )
  }
  if (isStale(previous, now())) {
    fail(
      'LOCK_EXPIRED',
      `edit_blender_selection: the Blender lock expired after ${Math.round(
        STALE_LOCK_MS / 60_000,
      )} minutes; ask the user to select objects again`,
    )
  }
  if (previous.status !== 'locked') {
    fail(
      'ALREADY_STAGED',
      'edit_blender_selection: this selection is already staged; wait for Blender to apply it',
    )
  }
  if (input.summary !== undefined && typeof input.summary !== 'string') {
    fail('INVALID_INPUT', 'edit_blender_selection: summary must be a string')
  }
  if (
    typeof input.summary === 'string' &&
    input.summary.length > MAX_SUMMARY_CHARS
  ) {
    fail(
      'TOO_LARGE',
      `edit_blender_selection: summary exceeds ${MAX_SUMMARY_CHARS} characters`,
    )
  }

  let script: string
  try {
    script = validateStagedScript(input.script, previous.selectionIds)
  } catch (error) {
    if (!(error instanceof BlenderScriptError)) throw error
    const code: BlenderToolErrorCode =
      error.code === 'TOO_LARGE' ? 'TOO_LARGE' : 'INVALID_SCRIPT'
    throw new BlenderToolError(code, error.message, { cause: error })
  }

  const next: BlenderState = {
    ...previous,
    // Keep the lock's creation time: staging must not extend its lifetime.
    status: 'staged',
    staged: {
      script,
      ...(typeof input.summary === 'string' && input.summary.length > 0
        ? { summary: input.summary }
        : {}),
    },
  }
  if (!writeBlenderState(next, file)) {
    fail(
      'FOREIGN_LOCK',
      'edit_blender_selection: this Blender lock belongs to another session; the state file was not written',
    )
  }
  return { previous, state: next }
}

/* ------------------------------------------------------------------ */
/* blender                                                             */
/* ------------------------------------------------------------------ */

/** The selected object names in a get_selection payload. */
export function selectionIdsFrom(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return []
  const record = payload as Record<string, unknown>
  for (const key of ['names', 'selected', 'selectedObjects', 'objects']) {
    const value = record[key]
    if (!Array.isArray(value)) continue
    const ids: string[] = []
    for (const item of value) {
      if (typeof item === 'string') {
        ids.push(item)
      } else if (
        item &&
        typeof item === 'object' &&
        typeof (item as { name?: unknown }).name === 'string'
      ) {
        ids.push((item as { name: string }).name)
      }
    }
    const normalized = normalizeSelectionIds(ids)
    if (normalized.length > 0) return normalized
  }
  return []
}

const MAX_PROMPT_SELECTION_CHARS = 64 * 1024

/** The prompt that turns `begin_edit` into a staged, reviewable edit. */
export function buildBeginEditPrompt(
  lockId: string,
  selectionIds: readonly string[],
  selection: unknown,
): string {
  let payload: string
  try {
    payload = JSON.stringify(selection) ?? 'null'
  } catch {
    payload = 'null'
  }
  if (payload.length > MAX_PROMPT_SELECTION_CHARS) {
    payload = `${payload.slice(0, MAX_PROMPT_SELECTION_CHARS)}…`
  }
  return [
    'Blender edit lock created.',
    `lockId: ${lockId}`,
    `selected objects: ${selectionIds.join(', ')}`,
    '',
    'Selection JSON:',
    payload,
    '',
    'Call edit_blender_selection with this lockId and a bpy script that mutates only the selected objects.',
    'That tool stages the script; it never executes it.',
    'Then call the blender tool with action "apply_staged" to run the staged script, or action "cancel_edit" to drop it.',
  ].join('\n')
}

const blenderInputSchema = lazySchema(() =>
  z.strictObject({
    action: z.enum(BLENDER_ACTIONS).describe('Which Blender operation to run.'),
    names: z.array(z.string()).optional().describe('Object names for select.'),
    mode: z
      .enum(SELECT_MODE_VALUES)
      .optional()
      .describe('Selection mode after selecting (default OBJECT).'),
    maxSize: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Maximum screenshot edge in pixels.'),
    format: z
      .enum(['glb', 'fbx'])
      .optional()
      .describe('Export format (default glb).'),
    selectionOnly: z
      .boolean()
      .optional()
      .describe('Export only the current selection.'),
    objectNames: z
      .array(z.string())
      .optional()
      .describe('Export these objects (and children) instead of the scene.'),
    code: z
      .string()
      .optional()
      .describe('Blender Python code for exec. Trusted escape hatch.'),
    path: z
      .string()
      .optional()
      .describe('Screenshot or export destination on the Blender host.'),
    lockId: z
      .string()
      .optional()
      .describe('The lockId to cancel (defaults to the active lock).'),
  }),
)
type BlenderInputSchema = ReturnType<typeof blenderInputSchema>

const blenderOutputSchema = lazySchema(() =>
  z.object({
    action: z.enum(BLENDER_ACTIONS),
    result: z.unknown(),
  }),
)
type BlenderOutputSchema = ReturnType<typeof blenderOutputSchema>
export type BlenderOutput = z.infer<BlenderOutputSchema>

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) fail('INVALID_INPUT', message)
  return value
}

function renderBlenderOutput(output: BlenderOutput): string {
  if (output.action === 'status') {
    const status = output.result as BlenderStatus
    if (status && status.connected) {
      const addon = status.addon
      const versions = [
        addon?.addonVersion ? `addon ${addon.addonVersion}` : undefined,
        addon?.blenderVersion ? `Blender ${addon.blenderVersion}` : undefined,
      ].filter(Boolean)
      return `Blender addon connected at ${status.host}:${status.port}${
        versions.length > 0 ? ` (${versions.join(', ')})` : ''
      }.`
    }
    return `Blender addon not connected at ${status?.host ?? '?'}:${
      status?.port ?? '?'
    }${status?.error ? `: ${status.error}` : '.'}`
  }
  const rendered = JSON.stringify(output.result, null, 2)
  return `${output.action}:\n${rendered ?? String(output.result)}`
}

export const BlenderTool = buildTool({
  name: BLENDER_TOOL_NAME,
  searchHint: 'inspect or drive a running Blender session',
  maxResultSizeChars: 100_000,
  async description() {
    return DESCRIPTION
  },
  async prompt() {
    return PROMPT
  },
  get inputSchema(): BlenderInputSchema {
    return blenderInputSchema()
  },
  get outputSchema(): BlenderOutputSchema {
    return blenderOutputSchema()
  },
  isEnabled() {
    // Default-on; only an explicit falsey flag opts out. A leftover state file
    // must not enable network access by itself.
    return blenderEnabled()
  },
  isConcurrencySafe() {
    return false
  },
  isReadOnly() {
    return false
  },
  userFacingName() {
    return 'Blender'
  },
  toAutoClassifierInput(input) {
    return input.action ?? ''
  },
  async call(input) {
    assertEnabled()
    const bridge = new BlenderBridge()
    try {
      let result: unknown
      switch (input.action) {
        case 'status':
          result = await bridge.status()
          break
        case 'scene':
          result = await bridge.scene()
          break
        case 'selection':
          result = await bridge.selection()
          break
        case 'select':
          result = await bridge.select(
            required(input.names, 'blender select requires names'),
            input.mode ?? 'OBJECT',
          )
          break
        case 'screenshot':
          result = await bridge.screenshot({
            ...(input.maxSize !== undefined ? { maxSize: input.maxSize } : {}),
            ...(input.path !== undefined ? { filepath: input.path } : {}),
          })
          break
        case 'export':
          result = await bridge.exportScene({
            filepath: required(input.path, 'blender export requires path'),
            format: input.format ?? 'glb',
            ...(input.objectNames !== undefined
              ? { objectNames: input.objectNames }
              : {}),
            ...(input.selectionOnly !== undefined
              ? { selectionOnly: input.selectionOnly }
              : {}),
          })
          break
        case 'exec':
          result = await bridge.exec(
            required(input.code, 'blender exec requires code'),
          )
          break
        case 'begin_edit': {
          const selection = await bridge.selection()
          const ids = selectionIdsFrom(selection)
          if (ids.length === 0) {
            fail(
              'INVALID_INPUT',
              'begin_edit: select at least one Blender object first',
            )
          }
          const file = blenderStatePath()
          let current = readBlenderState(file)
          if (current && isActive(current) && isStale(current)) {
            const recovered = clearStale(current)
            if (recovered.stale) writeBlenderState(recovered.state, file)
            current = recovered.state
          }
          const lockId = randomUUID()
          const began = beginLockFrom(
            current,
            lockId,
            ids,
            Date.now(),
            selection,
          )
          if (!began.ok) {
            fail(
              'ALREADY_STAGED',
              'begin_edit: another Blender edit is already in progress; apply or cancel it first',
            )
          }
          if (!writeBlenderState(began.state, file)) {
            fail(
              'FOREIGN_LOCK',
              'begin_edit: the Blender state file belongs to another session',
            )
          }
          result = {
            lockId,
            selectionIds: began.state.selectionIds,
            prompt: buildBeginEditPrompt(
              lockId,
              began.state.selectionIds,
              selection,
            ),
          }
          break
        }
        case 'apply_staged': {
          const file = blenderStatePath()
          const state = readBlenderState(file)
          if (
            !state ||
            !isActive(state) ||
            state.status !== 'staged' ||
            !state.staged
          ) {
            fail('NO_LOCK', 'apply_staged: no staged Blender edit')
          }
          if (
            usesSharedBlenderStateFile() &&
            state.sessionId !== blenderStateOwner()
          ) {
            fail(
              'FOREIGN_LOCK',
              'apply_staged: the Blender lock belongs to another session',
            )
          }
          if (isStale(state)) {
            writeBlenderState(clearStale(state).state, file)
            fail(
              'LOCK_EXPIRED',
              'apply_staged: the Blender lock expired; begin a new edit',
            )
          }
          let execResult: unknown
          try {
            execResult = await bridge.exec(state.staged.script)
          } catch (error) {
            writeBlenderState(abortLock(state), file)
            throw error
          }
          const applied = applyStaged(state, state.lockId ?? '', Date.now())
          writeBlenderState(applied.state, file)
          result = {
            applied: applied.applied,
            lockId: state.lockId,
            summary: state.staged.summary ?? null,
            result: execResult,
          }
          break
        }
        case 'cancel_edit': {
          const file = blenderStatePath()
          const state = readBlenderState(file)
          if (!state || !isActive(state)) {
            result = { cancelled: false }
            break
          }
          if (
            usesSharedBlenderStateFile() &&
            state.sessionId !== blenderStateOwner()
          ) {
            fail(
              'FOREIGN_LOCK',
              'cancel_edit: the Blender lock belongs to another session',
            )
          }
          const cancelled = cancelLock(state, input.lockId ?? '')
          if (cancelled.cancelled) {
            writeBlenderState(cancelled.state, file)
          }
          result = { cancelled: cancelled.cancelled }
          break
        }
        default: {
          // Exhaustive: zod already constrains the action.
          const neverAction: never = input.action
          throw new Error(`unknown Blender action: ${String(neverAction)}`)
        }
      }
      return { data: { action: input.action, result } }
    } finally {
      bridge.close()
    }
  },
  renderToolUseMessage(input) {
    switch (input.action) {
      case 'status':
        return 'check Blender status'
      case 'scene':
        return 'read Blender scene'
      case 'selection':
        return 'read Blender selection'
      case 'select':
        return `select ${input.names?.length ?? 0} Blender object(s)`
      case 'screenshot':
        return 'capture Blender viewport'
      case 'export':
        return `export ${input.format ?? 'glb'} from Blender`
      case 'exec':
        return 'execute Blender Python'
      case 'begin_edit':
        return 'lock the Blender selection for an AI edit'
      case 'apply_staged':
        return 'apply the staged Blender edit'
      case 'cancel_edit':
        return 'cancel the staged Blender edit'
      default:
        return 'Blender operation'
    }
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: renderBlenderOutput(output),
    }
  },
} satisfies ToolDef<BlenderInputSchema, BlenderOutput>)

/* ------------------------------------------------------------------ */
/* edit_blender_selection                                              */
/* ------------------------------------------------------------------ */

const editInputSchema = lazySchema(() =>
  z.strictObject({
    lockId: z
      .string()
      .min(1)
      .describe('The lockId the Blender plugin reported to the user.'),
    script: z
      .string()
      .min(1)
      .describe(
        'Blender Python that mutates only the locked objects; never executed by this tool.',
      ),
    summary: z
      .string()
      .optional()
      .describe('One-line description of the edit shown to the user.'),
  }),
)
type EditInputSchema = ReturnType<typeof editInputSchema>

const editOutputSchema = lazySchema(() =>
  z.object({
    success: z.literal(true),
    lockId: z.string(),
    status: z.literal('staged'),
    script: z.string(),
    summary: z.string().optional(),
  }),
)
type EditOutputSchema = ReturnType<typeof editOutputSchema>
export type EditBlenderSelectionOutput = z.infer<EditOutputSchema>

export const EditBlenderSelectionTool = buildTool({
  name: EDIT_BLENDER_SELECTION_TOOL_NAME,
  searchHint: 'stage a Blender edit for the locked selection',
  maxResultSizeChars: 64_000,
  async description() {
    return EDIT_DESCRIPTION
  },
  async prompt() {
    return EDIT_PROMPT
  },
  get inputSchema(): EditInputSchema {
    return editInputSchema()
  },
  get outputSchema(): EditOutputSchema {
    return editOutputSchema()
  },
  isEnabled() {
    // Default-on; only an explicit falsey flag opts out. A leftover state file
    // must not enable the tool by itself.
    return blenderEnabled()
  },
  isConcurrencySafe() {
    return false
  },
  isReadOnly() {
    return false
  },
  userFacingName() {
    return 'Edit Blender selection'
  },
  toAutoClassifierInput(input) {
    return input.summary ?? input.script ?? ''
  },
  async call(input) {
    assertEnabled()
    const { state } = stageBlenderSelection(input)
    return {
      data: {
        success: true as const,
        lockId: input.lockId,
        status: 'staged' as const,
        script: input.script,
        ...(input.summary !== undefined ? { summary: input.summary } : {}),
      } satisfies EditBlenderSelectionOutput,
    }
  },
  renderToolUseMessage(input) {
    return `stage Blender edit${input.summary ? `: ${input.summary}` : ''}`
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: `Staged a ${output.script.length}-character Blender script for lock ${
        output.lockId
      }${output.summary ? ` (${output.summary})` : ''}. It has not run; the user applies it. Do not call edit_blender_selection again for this lock.`,
    }
  },
} satisfies ToolDef<EditInputSchema, EditBlenderSelectionOutput>)

/** Registered in `src/tools.ts`. */
export const BLENDER_TOOLS = [BlenderTool, EditBlenderSelectionTool] as const
