import figures from 'figures'
import type { RefObject } from 'react'
import React, { useCallback, useMemo, useRef } from 'react'
import { Box, Text } from '@anthropic/ink'
import { useKeybindings } from '../keybindings/useKeybinding.js'
import { logEvent } from '../services/analytics/index.js'
import type {
  NormalizedUserMessage,
  RenderableMessage,
} from '../types/message.js'
import { isEmptyMessageText, SYNTHETIC_MESSAGES } from '../utils/messages.js'

// Helper type: narrow the first element of MessageContent to a block with known shape.
// MessageContent = string | ContentBlockParam[] | ContentBlock[], so indexing gives
// string | ContentBlockParam | ContentBlock which doesn't expose .type/.text directly.
type ContentBlock = { type: string; text?: string; name?: string; input?: unknown; id?: string; content?: unknown; [key: string]: unknown }
const firstBlock = (content: unknown): ContentBlock | undefined => {
  if (!Array.isArray(content)) return undefined
  const b = content[0]
  if (b == null || typeof b === 'string') return undefined
  return b as ContentBlock
}

const NAVIGABLE_TYPES = [
  'user',
  'assistant',
  'grouped_tool_use',
  'collapsed_read_search',
  'system',
  'attachment',
] as const
export type NavigableType = (typeof NAVIGABLE_TYPES)[number]

export type NavigableOf<T extends NavigableType> = Extract<
  RenderableMessage,
  { type: T }
>
export type NavigableMessage = RenderableMessage

// Tier-2 blocklist (tier-1 is height > 0) — things that render but aren't actionable.
export function isNavigableMessage(msg: NavigableMessage): boolean {
  switch (msg.type) {
    case 'assistant': {
      const b = firstBlock(msg.message.content)
      // Text responses (minus AssistantTextMessage's return-null cases — tier-1
      // misses unmeasured virtual items), or tool calls with extractable input.
      return (
        (b?.type === 'text' &&
          !isEmptyMessageText(b.text!) &&
          !SYNTHETIC_MESSAGES.has(b.text!)) ||
        (b?.type === 'tool_use' && b.name! in PRIMARY_INPUT)
      )
    }
    case 'user': {
      if (msg.isMeta || msg.isCompactSummary) return false
      const b = firstBlock(msg.message.content)
      if (b?.type !== 'text') return false
      // Interrupt etc. — synthetic, not user-authored.
      if (SYNTHETIC_MESSAGES.has(b.text!)) return false
      // Same filter as VirtualMessageList sticky-prompt: XML-wrapped (command
      // expansions, bash-stdout, etc.) aren't real prompts.
      return !stripSystemReminders(b.text!).startsWith('<')
    }
    case 'system':
      // biome-ignore lint/nursery/useExhaustiveSwitchCases: blocklist — fallthrough return-true is the design
      switch (msg.subtype) {
        case 'api_metrics':
        case 'stop_hook_summary':
        case 'turn_duration':
        case 'memory_saved':
        case 'agents_killed':
        case 'away_summary':
        case 'thinking':
          return false
      }
      return true
    case 'grouped_tool_use':
    case 'collapsed_read_search':
      return true
    case 'attachment':
      switch (msg.attachment.type) {
        case 'queued_command':
        case 'diagnostics':
        case 'hook_blocking_error':
        case 'hook_error_during_execution':
          return true
      }
      return false
  }
  return false
}

type PrimaryInput = {
  label: string
  extract: (input: Record<string, unknown>) => string | undefined
}
const str = (k: string) => (i: Record<string, unknown>) =>
  typeof i[k] === 'string' ? i[k] : undefined
const PRIMARY_INPUT: Record<string, PrimaryInput> = {
  Read: { label: 'path', extract: str('file_path') },
  Edit: { label: 'path', extract: str('file_path') },
  Write: { label: 'path', extract: str('file_path') },
  NotebookEdit: { label: 'path', extract: str('notebook_path') },
  Bash: { label: 'command', extract: str('command') },
  Grep: { label: 'pattern', extract: str('pattern') },
  Glob: { label: 'pattern', extract: str('pattern') },
  WebFetch: { label: 'url', extract: str('url') },
  WebSearch: { label: 'query', extract: str('query') },
  Task: { label: 'prompt', extract: str('prompt') },
  Agent: { label: 'prompt', extract: str('prompt') },
  Tmux: {
    label: 'command',
    extract: i =>
      Array.isArray(i.args) ? `tmux ${i.args.join(' ')}` : undefined,
  },
}

// Only AgentTool has renderGroupedToolUse — Edit/Bash/etc. stay as assistant tool_use blocks.
export function toolCallOf(
  msg: NavigableMessage,
): { name: string; input: Record<string, unknown> } | undefined {
  if (msg.type === 'assistant') {
    const b = firstBlock(msg.message.content)
    if (b?.type === 'tool_use')
      return { name: b.name!, input: b.input as Record<string, unknown> }
  }
  if (msg.type === 'grouped_tool_use') {
    const b = firstBlock(msg.messages[0]?.message.content)
    if (b?.type === 'tool_use')
      return { name: msg.toolName, input: b.input as Record<string, unknown> }
  }
  return undefined
}

export type MessageActionCaps = {
  copy: (text: string) => void
  edit: (msg: NormalizedUserMessage) => Promise<void>
}

// Identity builder — preserves tuple type so `run`'s param narrows (array literal widens without this).
function action<const T extends NavigableType, const K extends string>(a: {
  key: K
  label: string | ((s: MessageActionsState) => string)
  types: readonly T[]
  applies?: (s: MessageActionsState) => boolean
  stays?: true
  run: (m: NavigableOf<T>, caps: MessageActionCaps) => void
}) {
  return a
}

export const MESSAGE_ACTIONS = [
  action({
    key: 'enter',
    label: s => (s.expanded ? 'collapse' : 'expand'),
    types: [
      'grouped_tool_use',
      'collapsed_read_search',
      'attachment',
      'system',
    ],
    stays: true,
    // Empty — `stays` handled inline by dispatch.
    run: () => {},
  }),
  action({
    key: 'enter',
    label: 'edit',
    types: ['user'],
    run: (m, c) => void c.edit(m),
  }),
  action({
    key: 'c',
    label: 'copy',
    types: NAVIGABLE_TYPES,
    run: (m, c) => c.copy(copyTextOf(m)),
  }),
  action({
    key: 'p',
    // `!` safe: applies() guarantees toolName ∈ PRIMARY_INPUT.
    label: s => `copy ${PRIMARY_INPUT[s.toolName!]!.label}`,
    types: ['grouped_tool_use', 'assistant'],
    applies: s => s.toolName != null && s.toolName in PRIMARY_INPUT,
    run: (m, c) => {
      const tc = toolCallOf(m)
      if (!tc) return
      const val = PRIMARY_INPUT[tc.name]?.extract(tc.input)
      if (val) c.copy(val)
    },
  }),
] as const

function isApplicable(
  a: (typeof MESSAGE_ACTIONS)[number],
  c: MessageActionsState,
): boolean {
  if (!(a.types as readonly string[]).includes(c.msgType)) return false
  return !a.applies || a.applies(c)
}

export type MessageActionsState = {
  uuid: string
  msgType: NavigableType
  expanded: boolean
  toolName?: string
}

export type MessageActionsNav = {
  enterCursor: () => void
  navigatePrev: () => void
  navigateNext: () => void
  navigatePrevUser: () => void
  navigateNextUser: () => void
  navigateTop: () => void
  navigateBottom: () => void
  getSelected: () => NavigableMessage | null
}

export const MessageActionsSelectedContext = React.createContext(false)
export const InVirtualListContext = React.createContext(false)

// bg must go on the Box that HAS marginTop (margin stays outside paint) — that's inside each consumer.
export function useSelectedMessageBg(): 'messageActionsBackground' | undefined {
  return React.useContext(MessageActionsSelectedContext)
    ? 'messageActionsBackground'
    : undefined
}

// Can't call useKeybindings here — hook runs outside <KeybindingSetup> provider. Returns handlers instead.
export function useMessageActions(
  cursor: MessageActionsState | null,
  setCursor: React.Dispatch<React.SetStateAction<MessageActionsState | null>>,
  navRef: RefObject<MessageActionsNav | null>,
  caps: MessageActionCaps,
): {
  enter: () => void
  handlers: Record<string, () => void>
} {
  // Refs keep handlers stable — no useKeybindings re-register per message append.
  const cursorRef = useRef(cursor)
  cursorRef.current = cursor
  const capsRef = useRef(caps)
  capsRef.current = caps

  const handlers = useMemo(() => {
    const h: Record<string, () => void> = {
      'messageActions:prev': () => navRef.current?.navigatePrev(),
      'messageActions:next': () => navRef.current?.navigateNext(),
      'messageActions:prevUser': () => navRef.current?.navigatePrevUser(),
      'messageActions:nextUser': () => navRef.current?.navigateNextUser(),
      'messageActions:top': () => navRef.current?.navigateTop(),
      'messageActions:bottom': () => navRef.current?.navigateBottom(),
      'messageActions:escape': () =>
        setCursor(c => (c?.expanded ? { ...c, expanded: false } : null)),
      // ctrl+c skips the collapse step — from expanded-during-streaming, two-stage
      // would mean 3 presses to interrupt (collapse→null→cancel).
      'messageActions:ctrlc': () => setCursor(null),
    }
    for (const key of new Set(MESSAGE_ACTIONS.map(a => a.key))) {
      h[`messageActions:${key}`] = () => {
        const c = cursorRef.current
        if (!c) return
        const a = MESSAGE_ACTIONS.find(a => a.key === key && isApplicable(a, c))
        if (!a) return
        if (a.stays) {
          setCursor(c => (c ? { ...c, expanded: !c.expanded } : null))
          return
        }
        const m = navRef.current?.getSelected()
        if (!m) return
        ;(a.run as (m: NavigableMessage, c: MessageActionCaps) => void)(
          m,
          capsRef.current,
        )
        setCursor(null)
      }
    }
    return h
  }, [setCursor, navRef])

  const enter = useCallback(() => {
    logEvent('tengu_message_actions_enter', {})
    navRef.current?.enterCursor()
  }, [navRef])

  return { enter, handlers }
}

// Must mount inside <KeybindingSetup>.
export function MessageActionsKeybindings({
  handlers,
  isActive,
}: {
  handlers: Record<string, () => void>
  isActive: boolean
}): null {
  useKeybindings(handlers, { context: 'MessageActions', isActive })
  return null
}

// borderTop-only Box matches PromptInput's ─── line for stable footer height.
export function MessageActionsBar({
  cursor,
}: {
  cursor: MessageActionsState
}): React.ReactNode {
  const applicable = MESSAGE_ACTIONS.filter(a => isApplicable(a, cursor))
  return (
    <Box flexDirection="column" flexShrink={0} paddingY={1}>
      <Box
        borderStyle="single"
        borderTop
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        borderDimColor
      />
      <Box paddingX={2} paddingY={1}>
        {applicable.map((a, i) => {
          const label =
            typeof a.label === 'function' ? a.label(cursor) : a.label
          return (
            <React.Fragment key={a.key}>
              {i > 0 && <Text dimColor> · </Text>}
              {/* dimColor={false} forces SGR 22 — borderDimColor sibling bleeds dim into first cell */}
              <Text bold dimColor={false}>
                {a.key}
              </Text>
              <Text dimColor> {label}</Text>
            </React.Fragment>
          )
        })}
        <Text dimColor> · </Text>
        <Text bold dimColor={false}>
          {figures.arrowUp}
          {figures.arrowDown}
        </Text>
        <Text dimColor> navigate · </Text>
        <Text bold dimColor={false}>
          esc
        </Text>
        <Text dimColor> back</Text>
      </Box>
    </Box>
  )
}

export function stripSystemReminders(text: string): string {
  const CLOSE = '</system-reminder>'
  let t = text.trimStart()
  while (t.startsWith('<system-reminder>')) {
    const end = t.indexOf(CLOSE)
    if (end < 0) break
    t = t.slice(end + CLOSE.length).trimStart()
  }
  return t
}

export function copyTextOf(msg: NavigableMessage): string {
  switch (msg.type) {
    case 'user': {
      const b = firstBlock(msg.message.content)
      return b?.type === 'text' ? stripSystemReminders(b.text!) : ''
    }
    case 'assistant': {
      const b = firstBlock(msg.message.content)
      if (b?.type === 'text') return b.text!
      const tc = toolCallOf(msg)
      return tc ? (PRIMARY_INPUT[tc.name]?.extract(tc.input) ?? '') : ''
    }
    case 'grouped_tool_use':
      return msg.results.map(toolResultText).filter(Boolean).join('\n\n')
    case 'collapsed_read_search':
      return msg.messages
        .flatMap(m =>
          m.type === 'user'
            ? [toolResultText(m)]
            : m.type === 'grouped_tool_use'
              ? m.results.map(toolResultText)
              : [],
        )
        .filter(Boolean)
        .join('\n\n')
    case 'system':
      if ('content' in msg) return String(msg.content)
      if ('error' in msg) return String(msg.error)
      return String(msg.subtype ?? '')
    case 'attachment': {
      const a = msg.attachment
      if (a.type === 'queued_command') {
        const p = (a as { prompt?: unknown }).prompt
        return typeof p === 'string'
          ? p
          : (p as Array<{ type: string; text?: string }>).flatMap(b => (b.type === 'text' ? [b.text ?? ''] : [])).join('\n')
      }
      return `[${a.type}]`
    }
  }
  return ''
}

function toolResultText(r: NormalizedUserMessage): string {
  const b = firstBlock(r.message.content)
  if (b?.type !== 'tool_result') return ''
  const c = b.content
  if (typeof c === 'string') return c
  if (!c) return ''
  return (c as Array<{ type: string; text?: string }>).flatMap(x => (x.type === 'text' ? [x.text ?? ''] : [])).join('\n')
}
