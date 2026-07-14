import { logForDebugging } from '../../utils/debug.js'
import { errorMessage } from '../../utils/errors.js'
import { publishTerminalState, publishTerminalSync } from './events.js'
import { getTerminalManager } from './manager.js'

const COMMAND_DEDUPE_TTL_MS = 10 * 60 * 1000
const COMMAND_DEDUPE_MAX = 16_384
const recentCommandIds = new Map<string, number>()

function acceptLiveCommand(msg: Record<string, unknown>): boolean {
  const commandId =
    typeof msg.command_id === 'string' ? msg.command_id.trim() : ''
  if (!commandId) {
    logForDebugging(
      `[terminal] rejected ${String(msg.type)} without command_id`,
    )
    return false
  }

  const now = Date.now()
  const seenAt = recentCommandIds.get(commandId)
  if (seenAt !== undefined && now - seenAt <= COMMAND_DEDUPE_TTL_MS) {
    logForDebugging(
      `[terminal] dropped duplicate ${String(msg.type)} command_id=${commandId}`,
    )
    return false
  }

  if (seenAt !== undefined) recentCommandIds.delete(commandId)
  recentCommandIds.set(commandId, now)
  if (recentCommandIds.size > COMMAND_DEDUPE_MAX) {
    for (const [id, timestamp] of recentCommandIds) {
      if (
        now - timestamp > COMMAND_DEDUPE_TTL_MS ||
        recentCommandIds.size > COMMAND_DEDUPE_MAX
      ) {
        recentCommandIds.delete(id)
      }
      if (
        recentCommandIds.size <= COMMAND_DEDUPE_MAX &&
        now - timestamp <= COMMAND_DEDUPE_TTL_MS
      )
        break
    }
  }
  return true
}

/** 仅用于测试。 */
export function resetTerminalInboundDedupeForTests(): void {
  recentCommandIds.clear()
}

/**
 * 终端事件入站路由（Web → RCS → 会话进程）。
 *
 * structuredIO.processLine（headless）与 useReplBridge 的
 * onInboundMessage（REPL attach）在未知类型丢弃前调用这里。
 * Web 端击键属于用户本人操作，不经模型权限管线。
 */

export function isTerminalInboundType(type: unknown): type is string {
  return typeof type === 'string' && type.startsWith('terminal_')
}

/**
 * RCS 把 web→bridge 的事件规范化后包了两层信封，实测两种形态：
 *   1. { type, uuid, message: {...原始字段} }              （message.type === type）
 *   2. { type, uuid, message: { content, raw: {...原始} } } （字段在 message.raw）
 * 逐层剥离，取回带 term_id/data 的原始消息。
 */
function unwrapEnvelope(raw: Record<string, unknown>): Record<string, unknown> {
  const message = raw.message
  if (message && typeof message === 'object') {
    const m = message as Record<string, unknown>
    // 形态2：原始字段在 message.raw
    const inner = m.raw
    if (
      inner &&
      typeof inner === 'object' &&
      (inner as Record<string, unknown>).type === raw.type
    ) {
      return inner as Record<string, unknown>
    }
    // 形态1：message 本身即原始
    if (m.type === raw.type) return m
  }
  // 形态0：顶层即原始（本地直调）
  return raw
}

export function handleTerminalInboundMessage(
  raw: Record<string, unknown>,
): void {
  const manager = getTerminalManager()
  const msg = unwrapEnvelope(raw)
  if (!acceptLiveCommand(msg)) return
  try {
    switch (msg.type) {
      case 'terminal_input': {
        const termId = String(msg.term_id ?? '')
        const data = typeof msg.data === 'string' ? msg.data : ''
        if (termId && data && manager.has(termId)) {
          manager.write(termId, data)
        }
        break
      }
      case 'terminal_resize': {
        const termId = String(msg.term_id ?? '')
        const cols = Number(msg.cols)
        const rows = Number(msg.rows)
        if (
          termId &&
          manager.has(termId) &&
          Number.isFinite(cols) &&
          Number.isFinite(rows) &&
          cols > 10 &&
          rows > 2
        ) {
          manager.resize(termId, Math.floor(cols), Math.floor(rows))
        }
        break
      }
      case 'terminal_open': {
        const requested = typeof msg.name === 'string' ? msg.name.trim() : ''
        const name = requested || nextDefaultName()
        manager.open({ name, purpose: '用户从 Web 界面打开' })
        publishTerminalSync()
        break
      }
      case 'terminal_close': {
        const termId = String(msg.term_id ?? '')
        if (termId && manager.has(termId)) {
          manager.close(termId)
        }
        break
      }
      case 'terminal_sync': {
        publishTerminalSync()
        break
      }
      default:
        logForDebugging(
          `[terminal] ignoring unknown inbound type: ${String(msg.type)}`,
        )
    }
  } catch (err) {
    logForDebugging(
      `[terminal] inbound ${String(msg.type)} failed: ${errorMessage(err)}`,
    )
    publishTerminalState()
  }
}

function nextDefaultName(): string {
  const existing = new Set(
    getTerminalManager()
      .list()
      .map(t => t.name),
  )
  if (!existing.has('main')) return 'main'
  for (let i = 2; i < 100; i++) {
    const name = `term-${i}`
    if (!existing.has(name)) return name
  }
  return `term-${Date.now()}`
}
