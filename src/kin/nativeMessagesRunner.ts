/**
 * NativeMessagesRunner — stateless native_messages slot host.
 *
 * The CLI holds no tools/agents/canUseTool and no cross-job state. Each slot
 * is a plain { id, phase, jobId?, abort?, task? } record; a job is exactly
 * one queryKinMessagesWithStreaming() call whose caller-supplied
 * messages/system/tools/tool_choice/thinking/sampling flow straight to the
 * real API pipeline. Tool execution, continuation, and cancellation
 * bookkeeping all live in Rust (.trellis/tasks/08-30-native-slot-stateless).
 */
import { createInterface } from 'node:readline'
import type {
  BetaToolChoiceAuto,
  BetaToolChoiceTool,
  BetaToolUnion,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { queryKinMessagesWithStreaming } from '../services/api/claude.js'
import type { Message } from '../types/message.js'
import { createAssistantMessage, createUserMessage } from '../utils/messages.js'
import type { ThinkingConfig } from '../utils/thinking.js'
import { getKinTimezone, getSystemLayout } from './systemLayout.js'
import {
  KIN_CAPABILITIES,
  KIN_PROTOCOL_VERSION,
  parseStdinLine,
  slotId,
  writeStdout,
} from './stdioProtocol.js'

type Phase = 'idle' | 'running' | 'cancelling'

type SlotState = {
  id: string
  phase: Phase
  jobId?: string
  abort?: AbortController
  task?: Promise<void>
}

export function nativeSlotCount(): number {
  const raw = process.env.CLAUDE_CODE_KIN_NATIVE_SLOTS
  const n = raw ? Number(raw) : 0
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(20, Math.max(1, Math.floor(n)))
}

export async function runNativeMessagesLoop(_ctx: {
  options: {
    userSpecifiedModel?: string
    fallbackModel?: string
    thinkingConfig?: ThinkingConfig
  }
}): Promise<void> {
  const n = nativeSlotCount()
  if (n <= 0) return
  process.env.CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK = '1'

  process.stderr.write(
    `[kin] native_messages loop n=${n} protocol=${KIN_PROTOCOL_VERSION}\n`,
  )
  const slots = new Map<string, SlotState>()
  for (let i = 0; i < n; i++) {
    const id = slotId(i)
    slots.set(id, { id, phase: 'idle' })
  }
  await writeStdout({
    type: 'kin_host_ready',
    protocol_version: KIN_PROTOCOL_VERSION,
    slots: n,
    system_layout: getSystemLayout(),
    timezone: getKinTimezone(),
    capabilities: [...KIN_CAPABILITIES],
  })
  for (const id of slots.keys()) {
    await writeStdout({ type: 'kin_slot_ready', slot_id: id })
  }

  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })
  for await (const line of rl) {
    const msg = parseStdinLine(line)
    if (!msg) continue
    switch (msg.type) {
      case 'kin_job_start':
        startJob(slots, msg.slot_id, msg.job_id, msg.request, _ctx.options)
        break
      case 'kin_cancel':
        await cancelJob(slots, msg.slot_id, msg.job_id)
        break
    }
  }
}

function startJob(
  slots: Map<string, SlotState>,
  slotIdArg: string,
  jobId: string,
  request: Record<string, unknown>,
  hostOptions: {
    userSpecifiedModel?: string
    fallbackModel?: string
    thinkingConfig?: ThinkingConfig
  },
): void {
  const slot = slots.get(slotIdArg)
  if (!slot) {
    void writeStdout({
      type: 'kin_job_error',
      job_id: jobId,
      slot_id: slotIdArg,
      error: `unknown slot ${slotIdArg}`,
    })
    return
  }
  if (slot.phase !== 'idle') {
    void writeStdout({
      type: 'kin_job_error',
      job_id: jobId,
      slot_id: slot.id,
      error: `slot ${slot.id} busy phase=${slot.phase}`,
    })
    return
  }

  const abort = new AbortController()
  slot.phase = 'running'
  slot.jobId = jobId
  slot.abort = abort
  slot.task = runJob(slot, jobId, request, hostOptions, abort).finally(() => {
    if (slot.jobId === jobId) {
      slot.phase = 'idle'
      slot.jobId = undefined
      slot.abort = undefined
      slot.task = undefined
    }
  })
}

async function cancelJob(
  slots: Map<string, SlotState>,
  slotIdArg: string | undefined,
  jobId: string,
): Promise<void> {
  const slot = slotIdArg ? slots.get(slotIdArg) : undefined
  if (!slot || slot.jobId !== jobId) return
  if (slot.phase !== 'running') return
  slot.phase = 'cancelling'
  slot.abort?.abort()
  await slot.task
  slot.phase = 'idle'
  slot.jobId = undefined
  slot.abort = undefined
  slot.task = undefined
  await writeStdout({ type: 'kin_cancel_ack', job_id: jobId, slot_id: slot.id })
}

async function runJob(
  slot: SlotState,
  jobId: string,
  request: Record<string, unknown>,
  hostOptions: {
    userSpecifiedModel?: string
    fallbackModel?: string
    thinkingConfig?: ThinkingConfig
  },
  abort: AbortController,
): Promise<void> {
  const model =
    typeof request.model === 'string' && request.model
      ? request.model
      : hostOptions.userSpecifiedModel || ''
  const messages = messagesFromRequest(request)
  const system = systemFromRequest(request)
  const toolSchemas = Array.isArray(request.tools)
    ? (request.tools as BetaToolUnion[])
    : []
  const toolChoice = request.tool_choice as
    | BetaToolChoiceTool
    | BetaToolChoiceAuto
    | undefined
  const thinking = thinkingFromRequest(request, hostOptions.thinkingConfig)
  const maxTokens =
    typeof request.max_tokens === 'number' ? request.max_tokens : undefined
  const temperature =
    typeof request.temperature === 'number' ? request.temperature : undefined
  const topP = typeof request.top_p === 'number' ? request.top_p : undefined
  const topK = typeof request.top_k === 'number' ? request.top_k : undefined
  const stopSequences = Array.isArray(request.stop_sequences)
    ? (request.stop_sequences as string[])
    : undefined

  let stopReason = 'end_turn'
  let usage: unknown = {}
  try {
    const stream = queryKinMessagesWithStreaming({
      messages,
      system,
      toolSchemas,
      toolChoice,
      thinking,
      maxTokens,
      temperature,
      topP,
      topK,
      stopSequences,
      model,
      signal: abort.signal,
    })
    for await (const ev of stream) {
      if (ev.type === 'stream_event') {
        const rec = ev as { event?: unknown }
        await writeStdout({
          type: 'kin_stream_event',
          job_id: jobId,
          slot_id: slot.id,
          event: rec.event,
        })
        continue
      }
      if (ev.type === 'assistant') {
        const rec = ev as {
          message?: { stop_reason?: string; usage?: unknown }
        }
        stopReason = rec.message?.stop_reason || stopReason
        usage = rec.message?.usage || usage
        continue
      }
      if (ev.type === 'system') {
        const text = extractErrorText(ev as Record<string, unknown>)
        await writeStdout({
          type: 'kin_job_error',
          job_id: jobId,
          slot_id: slot.id,
          error: text,
        })
        return
      }
    }
  } catch (err) {
    if (!abort.signal.aborted) {
      await writeStdout({
        type: 'kin_job_error',
        job_id: jobId,
        slot_id: slot.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
    return
  }

  if (abort.signal.aborted) return

  await writeStdout({
    type: 'kin_job_done',
    job_id: jobId,
    slot_id: slot.id,
    stop_reason: stopReason,
    usage,
  })
}

function extractErrorText(ev: Record<string, unknown>): string {
  const message = ev.message as { content?: unknown } | undefined
  const content = message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const first = content[0] as { text?: unknown } | undefined
    if (first && typeof first.text === 'string') return first.text
  }
  return 'system error'
}

function systemFromRequest(request: Record<string, unknown>): string[] {
  const system = request.system
  if (typeof system === 'string') return [system]
  if (!Array.isArray(system)) return []
  return system.map(block => {
    if (typeof block === 'string') return block
    if (block && typeof block === 'object' && 'text' in block) {
      return String((block as { text?: unknown }).text || '')
    }
    return ''
  })
}

function messagesFromRequest(request: Record<string, unknown>): Message[] {
  const messages = Array.isArray(request.messages) ? request.messages : []
  return messages.map(toEngineMessage).filter((m): m is Message => m !== null)
}

function toEngineMessage(raw: unknown): Message | null {
  if (!raw || typeof raw !== 'object') return null
  const msg = raw as { role?: string; content?: unknown }
  const content = msg.content
  const asContent: string | ContentBlockParam[] =
    typeof content === 'string' || Array.isArray(content)
      ? (content as string | ContentBlockParam[])
      : ''
  if (msg.role === 'assistant') {
    return createAssistantMessage({ content: asContent as never })
  }
  if (msg.role === 'user' || msg.role === 'tool') {
    return createUserMessage({ content: asContent })
  }
  return null
}

function thinkingFromRequest(
  request: Record<string, unknown>,
  fallback: ThinkingConfig | undefined,
): ThinkingConfig {
  const raw = request.thinking
  if (raw && typeof raw === 'object') {
    const rec = raw as {
      type?: string
      budget_tokens?: number
      budgetTokens?: number
    }
    if (rec.type === 'enabled') {
      return {
        type: 'enabled',
        budgetTokens: Number(rec.budget_tokens ?? rec.budgetTokens ?? 0),
      }
    }
    if (rec.type === 'adaptive') return { type: 'adaptive' }
    if (rec.type === 'disabled' || rec.type === 'none')
      return { type: 'disabled' }
  }
  return fallback ?? { type: 'disabled' }
}
