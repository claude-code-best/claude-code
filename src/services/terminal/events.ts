import { randomUUID } from 'node:crypto'
import { logForDebugging } from '../../utils/debug.js'
import { errorMessage } from '../../utils/errors.js'
import { getTerminalManager } from './manager.js'

/**
 * 终端事件桥 — 出站方向（会话进程 → RCS → Web）。
 *
 * 宿主（print.ts / useReplBridge）注册一个 writer；本模块订阅
 * TerminalManager，将输出按 40ms 合帧、状态变更去抖后写出。
 * 事件协议见 docs/features/session-terminals.md §4。
 */

export type TerminalEventWriter = (msg: Record<string, unknown>) => void

const COALESCE_MS = 40
const MAX_FRAME_CHARS = 16 * 1024

let writer: TerminalEventWriter | null = null
let unsubscribe: (() => void) | null = null
let seq = 0
const streamIds = new Map<string, string>()
const outputSeqs = new Map<string, number>()

const pendingOutput = new Map<string, string>()
let flushTimer: ReturnType<typeof setTimeout> | null = null
let stateTimer: ReturnType<typeof setTimeout> | null = null

function write(msg: Record<string, unknown>): void {
  try {
    writer?.(msg)
  } catch (err) {
    logForDebugging(`[terminal] event write failed: ${errorMessage(err)}`)
  }
}

function streamId(termId: string): string {
  let id = streamIds.get(termId)
  if (!id) {
    id = randomUUID()
    streamIds.set(termId, id)
  }
  return id
}

function flushOutput(): void {
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = null
  for (const [termId, data] of pendingOutput) {
    // 保留完整 PTY 字节序：超大批次拆成多个有序帧，绝不静默截断。
    for (let offset = 0; offset < data.length; offset += MAX_FRAME_CHARS) {
      const payload = data.slice(offset, offset + MAX_FRAME_CHARS)
      seq += 1
      const outputSeq = (outputSeqs.get(termId) ?? 0) + 1
      outputSeqs.set(termId, outputSeq)
      write({
        type: 'terminal_output',
        uuid: randomUUID(),
        term_id: termId,
        seq,
        stream_id: streamId(termId),
        output_seq: outputSeq,
        data: payload,
      })
    }
  }
  pendingOutput.clear()
}

function scheduleFlush(): void {
  if (flushTimer) return
  flushTimer = setTimeout(flushOutput, COALESCE_MS)
  flushTimer.unref?.()
}

export function publishTerminalState(): void {
  if (stateTimer) return
  stateTimer = setTimeout(() => {
    stateTimer = null
    const terminals = getTerminalManager()
      .list()
      .map(t => ({
        id: t.id,
        name: t.name,
        purpose: t.purpose,
        cwd: t.cwd,
        cols: t.cols,
        rows: t.rows,
        alive: t.alive,
        stream_id: streamId(t.id),
        fg_command: t.fgCommand,
        last_activity: t.lastActivityAt,
      }))
    write({
      type: 'terminal_state',
      uuid: randomUUID(),
      terminals,
    })
  }, 50)
  stateTimer.unref?.()
}

/** 全量重发：state + 每个终端的原始 ANSI 快照（Web 刷新/重连恢复用） */
export function publishTerminalSync(): void {
  flushOutput()
  const manager = getTerminalManager()
  publishTerminalState()
  for (const t of manager.list()) {
    write({
      type: 'terminal_snapshot',
      uuid: randomUUID(),
      term_id: t.id,
      stream_id: streamId(t.id),
      through_output_seq: outputSeqs.get(t.id) ?? 0,
      data: manager.rawSnapshot(t.id),
    })
  }
}

/**
 * 注册出站 writer 并开始桥接。重复调用会替换 writer（重连场景）。
 * 传入 null 停止桥接。
 */
export function setTerminalEventWriter(w: TerminalEventWriter | null): void {
  writer = w
  if (!w) {
    unsubscribe?.()
    unsubscribe = null
    return
  }
  if (!unsubscribe) {
    unsubscribe = getTerminalManager().subscribe(ev => {
      if (ev.kind === 'output') {
        pendingOutput.set(
          ev.termId,
          (pendingOutput.get(ev.termId) ?? '') + ev.data,
        )
        scheduleFlush()
      } else {
        publishTerminalState()
      }
    })
  }
  // 新 writer 接入时主动同步一次现状
  publishTerminalSync()
}
