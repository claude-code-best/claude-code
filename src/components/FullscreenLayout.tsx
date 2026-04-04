import figures from 'figures'
import React, {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { fileURLToPath } from 'url'
import { ModalContext } from '../context/modalContext.js'
import {
  PromptOverlayProvider,
  usePromptOverlay,
  usePromptOverlayDialog,
} from '../context/promptOverlayContext.js'
import { useTerminalSize } from '../hooks/useTerminalSize.js'
import ScrollBox, { type ScrollBoxHandle } from '../ink/components/ScrollBox.js'
import instances from '../ink/instances.js'
import { Box, Text } from '../ink.js'
import type { Message } from '../types/message.js'
import { openBrowser, openPath } from '../utils/browser.js'
import { isFullscreenEnvEnabled } from '../utils/fullscreen.js'
import { plural } from '../utils/stringUtils.js'
import { isNullRenderingAttachment } from './messages/nullRenderingAttachments.js'
import PromptInputFooterSuggestions from './PromptInput/PromptInputFooterSuggestions.js'
import type { StickyPrompt } from './VirtualMessageList.js'

/** Rows of transcript context kept visible above the modal pane's ▔ divider. */
const MODAL_TRANSCRIPT_PEEK = 2

/** Context for scroll-derived chrome (sticky header, pill). StickyTracker
 *  in VirtualMessageList writes via this instead of threading a callback
 *  up through Messages → REPL → FullscreenLayout. The setter is stable so
 *  consuming this context never causes re-renders. */
export const ScrollChromeContext = createContext<{
  setStickyPrompt: (p: StickyPrompt | null) => void
}>({ setStickyPrompt: () => {} })

type Props = {
  /** Content that scrolls (messages, tool output) */
  scrollable: ReactNode
  /** Content pinned to the bottom (spinner, prompt, permissions) */
  bottom: ReactNode
  /** Content rendered inside the ScrollBox after messages — user can scroll
   *  up to see context while it's showing (used by PermissionRequest). */
  overlay?: ReactNode
  /** Absolute-positioned content anchored at the bottom-right of the
   *  ScrollBox area, floating over scrollback. Rendered inside the flexGrow
   *  region (not the bottom slot) so the overflowY:hidden cap doesn't clip
   *  it. Fullscreen only — used for the companion speech bubble. */
  bottomFloat?: ReactNode
  /** Slash-command dialog content. Rendered in an absolute-positioned
   *  bottom-anchored pane (▔ divider, paddingX=2) that paints over the
   *  ScrollBox AND bottom slot. Provides ModalContext so Pane/Dialog inside
   *  skip their own frame. Fullscreen only; inline after overlay otherwise. */
  modal?: ReactNode
  /** Ref passed via ModalContext so Tabs (or any scroll-owning descendant)
   *  can attach it to their own ScrollBox for tall content. */
  modalScrollRef?: React.RefObject<ScrollBoxHandle | null>
  /** Ref to the scroll box for keyboard scrolling. RefObject (not Ref) so
   *  pillVisible's useSyncExternalStore can subscribe to scroll changes. */
  scrollRef?: RefObject<ScrollBoxHandle | null>
  /** Y-position (scrollHeight at snapshot) of the unseen-divider. Pill
   *  shows while viewport bottom hasn't reached this. Ref so REPL doesn't
   *  re-render on the one-shot snapshot write. */
  dividerYRef?: RefObject<number | null>
  /** Force-hide the pill (e.g. viewing a sub-agent task). */
  hidePill?: boolean
  /** Force-hide the sticky prompt header (e.g. viewing a teammate task). */
  hideSticky?: boolean
  /** Count for the pill text. 0 → "Jump to bottom", >0 → "N new messages". */
  newMessageCount?: number
  /** Called when the user clicks the "N new" pill. */
  onPillClick?: () => void
}

/**
 * Tracks the in-transcript "N new messages" divider position while the
 * user is scrolled up. Snapshots message count AND scrollHeight the first
 * time sticky breaks. scrollHeight ≈ the y-position of the divider in the
 * scroll content (it renders right after the last message that existed at
 * snapshot time).
 *
 * `pillVisible` lives in FullscreenLayout (not here) — it subscribes
 * directly to ScrollBox via useSyncExternalStore with a boolean snapshot
 * against `dividerYRef`, so per-frame scroll never re-renders REPL.
 * `dividerIndex` stays here because REPL needs it for computeUnseenDivider
 * → Messages' divider line; it changes only ~twice/scroll-session
 * (first scroll-away + repin), acceptable REPL re-render cost.
 *
 * `onScrollAway` must be called by every scroll-away action with the
 * handle; `onRepin` by submit/scroll-to-bottom.
 */
export function useUnseenDivider(messageCount: number): {
  /** Index into messages[] where the divider line renders. Cleared on
   *  sticky-resume (scroll back to bottom) so the "N new" line doesn't
   *  linger once everything is visible. */
  dividerIndex: number | null
  /** scrollHeight snapshot at first scroll-away — the divider's y-position.
   *  FullscreenLayout subscribes to ScrollBox and compares viewport bottom
   *  against this for pillVisible. Ref so writes don't re-render REPL. */
  dividerYRef: RefObject<number | null>
  onScrollAway: (handle: ScrollBoxHandle) => void
  onRepin: () => void
  /** Scroll the handle so the divider line is at the top of the viewport. */
  jumpToNew: (handle: ScrollBoxHandle | null) => void
  /** Shift dividerIndex and dividerYRef when messages are prepended
   *  (infinite scroll-back). indexDelta = number of messages prepended;
   *  heightDelta = content height growth in rows. */
  shiftDivider: (indexDelta: number, heightDelta: number) => void
} {
  const [dividerIndex, setDividerIndex] = useState<number | null>(null)
  // Ref holds the current count for onScrollAway to snapshot. Written in
  // the render body (not useEffect) so wheel events arriving between a
  // message-append render and its effect flush don't capture a stale
  // count (off-by-one in the baseline). React Compiler bails out here —
  // acceptable for a hook instantiated once in REPL.
  const countRef = useRef(messageCount)
  countRef.current = messageCount
  // scrollHeight snapshot — the divider's y in content coords. Ref-only:
  // read synchronously in onScrollAway (setState is batched, can't
  // read-then-write in the same callback) AND by FullscreenLayout's
  // pillVisible subscription. null = pinned to bottom.
  const dividerYRef = useRef<number | null>(null)

  const onRepin = useCallback(() => {
    // Don't clear dividerYRef here — a trackpad momentum wheel event
    // racing in the same stdin batch would see null and re-snapshot,
    // overriding the setDividerIndex(null) below. The useEffect below
    // clears the ref after React commits the null dividerIndex, so the
    // ref stays non-null until the state settles.
    setDividerIndex(null)
  }, [])

  const onScrollAway = useCallback((handle: ScrollBoxHandle) => {
    // Nothing below the viewport → nothing to jump to. Covers both:
    // • empty/short session: scrollUp calls scrollTo(0) which breaks sticky
    //   even at scrollTop=0 (wheel-up on fresh session showed the pill)
    // • click-to-select at bottom: useDragToScroll.check() calls
    //   scrollTo(current) to break sticky so streaming content doesn't shift
    //   under the selection, then onScroll(false, …) — but scrollTop is still
    //   at max (Sarah Deaton, #claude-code-feedback 2026-03-15)
    // pendingDelta: scrollBy accumulates without updating scrollTop. Without
    // it, wheeling up from max would see scrollTop==max and suppress the pill.
    const max = Math.max(
      0,
      handle.getScrollHeight() - handle.getViewportHeight(),
    )
    if (handle.getScrollTop() + handle.getPendingDelta() >= max) return
    // Snapshot only on the FIRST scroll-away. onScrollAway fires on EVERY
    // scroll action (not just the initial break from sticky) — this guard
    // preserves the original baseline so the count doesn't reset on the
    // second PageUp. Subsequent calls are ref-only no-ops (no REPL re-render).
    if (dividerYRef.current === null) {
      dividerYRef.current = handle.getScrollHeight()
      // New scroll-away session → move the divider here (replaces old one)
      setDividerIndex(countRef.current)
    }
  }, [])

  const jumpToNew = useCallback((handle: ScrollBoxHandle | null) => {
    if (!handle) return
    // scrollToBottom (not scrollTo(dividerY)): sets stickyScroll=true so
    // useVirtualScroll mounts the tail and render-node-to-output pins
    // scrollTop=maxScroll. scrollTo sets stickyScroll=false → the clamp
    // (still at top-range bounds before React re-renders) pins scrollTop
    // back, stopping short. The divider stays rendered (dividerIndex
    // unchanged) so users see where new messages started; the clear on
    // next submit/explicit scroll-to-bottom handles cleanup.
    handle.scrollToBottom()
  }, [])

  // Sync dividerYRef with dividerIndex. When onRepin fires (submit,
  // scroll-to-bottom), it sets dividerIndex=null but leaves the ref
  // non-null — a wheel event racing in the same stdin batch would
  // otherwise see null and re-snapshot. Deferring the ref clear to
  // useEffect guarantees the ref stays non-null until React has committed
  // the null dividerIndex, blocking the if-null guard in onScrollAway.
  //
  // Also handles /clear, rewind, teammate-view swap — if the count drops
  // below the divider index, the divider would point at nothing.
  useEffect(() => {
    if (dividerIndex === null) {
      dividerYRef.current = null
    } else if (messageCount < dividerIndex) {
      dividerYRef.current = null
      setDividerIndex(null)
    }
  }, [messageCount, dividerIndex])

  const shiftDivider = useCallback(
    (indexDelta: number, heightDelta: number) => {
      setDividerIndex(idx => (idx === null ? null : idx + indexDelta))
      if (dividerYRef.current !== null) {
        dividerYRef.current += heightDelta
      }
    },
    [],
  )

  return {
    dividerIndex,
    dividerYRef,
    onScrollAway,
    onRepin,
    jumpToNew,
    shiftDivider,
  }
}

/**
 * Counts assistant turns in messages[dividerIndex..end). A "turn" is what
 * users think of as "a new message from Claude" — not raw assistant entries
 * (one turn yields multiple entries: tool_use blocks + text blocks). We count
 * non-assistant→assistant transitions, but only for entries that actually
 * carry text — tool-use-only entries are skipped (like progress messages)
 * so "⏺ Searched for 13 patterns, read 6 files" doesn't tick the pill.
 */
export function countUnseenAssistantTurns(
  messages: readonly Message[],
  dividerIndex: number,
): number {
  let count = 0
  let prevWasAssistant = false
  for (let i = dividerIndex; i < messages.length; i++) {
    const m = messages[i]!
    if (m.type === 'progress') continue
    // Tool-use-only assistant entries aren't "new messages" to the user —
    // skip them the same way we skip progress. prevWasAssistant is NOT
    // updated, so a text block immediately following still counts as the
    // same turn (tool_use + text from one API response = 1).
    if (m.type === 'assistant' && !assistantHasVisibleText(m)) continue
    const isAssistant = m.type === 'assistant'
    if (isAssistant && !prevWasAssistant) count++
    prevWasAssistant = isAssistant
  }
  return count
}

function assistantHasVisibleText(m: Message): boolean {
  if (m.type !== 'assistant') return false
  for (const b of m.message.content) {
    if (b.type === 'text' && b.text.trim() !== '') return true
  }
  return false
}

export type UnseenDivider = { firstUnseenUuid: Message['uuid']; count: number }

/**
 * Builds the unseenDivider object REPL passes to Messages + the pill.
 * Returns undefined only when no content has arrived past the divider
 * yet (messages[dividerIndex] doesn't exist). Once ANY message arrives
 * — including tool_use-only assistant entries and tool_result user entries
 * that countUnseenAssistantTurns skips — count floors at 1 so the pill
 * flips from "Jump to bottom" to "1 new message". Without the floor,
 * the pill stays "Jump to bottom" through an entire tool-call sequence
 * until Claude's text response lands.
 */
export function computeUnseenDivider(
  messages: readonly Message[],
  dividerIndex: number | null,
): UnseenDivider | undefined {
  if (dividerIndex === null) return undefined
  // Skip progress and null-rendering attachments when picking the divider
  // anchor — Messages.tsx filters these out of renderableMessages before the
  // dividerBeforeIndex search, so their UUID wouldn't be found (CC-724).
  // Hook attachments use randomUUID() so nothing shares their 24-char prefix.
  let anchorIdx = dividerIndex
  while (
    anchorIdx < messages.length &&
    (messages[anchorIdx]?.type === 'progress' ||
      isNullRenderingAttachment(messages[anchorIdx]!))
  ) {
    anchorIdx++
  }
  const uuid = messages[anchorIdx]?.uuid
  if (!uuid) return undefined
  const count = countUnseenAssistantTurns(messages, dividerIndex)
  return { firstUnseenUuid: uuid, count: Math.max(1, count) }
}

/**
 * Layout wrapper for the REPL. In fullscreen mode, puts scrollable
 * content in a sticky-scroll box and pins bottom content via flexbox.
 * Outside fullscreen mode, renders content sequentially so the existing
 * main-screen scrollback rendering works unchanged.
 *
 * Fullscreen mode defaults on for ants (CLAUDE_CODE_NO_FLICKER=0 to opt out)
 * and off for external users (CLAUDE_CODE_NO_FLICKER=1 to opt in).
 * The <AlternateScreen> wrapper
 * (alt buffer + mouse tracking + height constraint) lives at REPL's root
 * so nothing can accidentally render outside it.
 */
export function FullscreenLayout({
  scrollable,
  bottom,
  overlay,
  bottomFloat,
  modal,
  modalScrollRef,
  scrollRef,
  dividerYRef,
  hidePill = false,
  hideSticky = false,
  newMessageCount = 0,
  onPillClick,
}: Props): React.ReactNode {
  const { rows: terminalRows, columns } = useTerminalSize()
  // Scroll-derived chrome state lives HERE, not in REPL. StickyTracker
  // writes via ScrollChromeContext; pillVisible subscribes directly to
  // ScrollBox. Both change rarely (pill flips once per threshold crossing,
  // sticky changes ~5-20×/transcript) — re-rendering FullscreenLayout on
  // those is fine; re-rendering the 6966-line REPL + its 22+ useAppState
  // selectors per-scroll-frame was not.
  const [stickyPrompt, setStickyPrompt] = useState<StickyPrompt | null>(null)
  const chromeCtx = useMemo(() => ({ setStickyPrompt }), [])
  // Boolean-quantized scroll subscription. Snapshot is "is viewport bottom
  // above the divider y?" — Object.is on a boolean → FullscreenLayout only
  // re-renders when the pill should actually flip, not per-frame.
  const subscribe = useCallback(
    (listener: () => void) =>
      scrollRef?.current?.subscribe(listener) ?? (() => {}),
    [scrollRef],
  )
  const pillVisible = useSyncExternalStore(subscribe, () => {
    const s = scrollRef?.current
    const dividerY = dividerYRef?.current
    if (!s || dividerY == null) return false
    return (
      s.getScrollTop() + s.getPendingDelta() + s.getViewportHeight() < dividerY
    )
  })
  // Wire up hyperlink click handling — in fullscreen mode, mouse tracking
  // intercepts clicks before the terminal can open OSC 8 links natively.
  useLayoutEffect(() => {
    if (!isFullscreenEnvEnabled()) return
    const ink = instances.get(process.stdout)
    if (!ink) return
    ink.onHyperlinkClick = url => {
      // Most OSC 8 links emitted by Claude Code are file:// URLs from
      // FilePathLink (FileEdit/FileWrite/FileRead tool output). openBrowser
      // rejects non-http(s) protocols — route file: to openPath instead.
      if (url.startsWith('file:')) {
        try {
          void openPath(fileURLToPath(url))
        } catch {
          // Malformed file: URLs (e.g. file://host/path from plain-text
          // detection) cause fileURLToPath to throw — ignore silently.
        }
      } else {
        void openBrowser(url)
      }
    }
    return () => {
      ink.onHyperlinkClick = undefined
    }
  }, [])

  if (isFullscreenEnvEnabled()) {
    // Overlay renders BELOW messages inside the same ScrollBox — user can
    // scroll up to see prior context while a permission dialog is showing.
    // The ScrollBox never unmounts across overlay transitions, so scroll
    // position is preserved without save/restore. stickyScroll auto-scrolls
    // to the appended overlay when it mounts (if user was already at
    // bottom); REPL re-pins on the overlay appear/dismiss transition for
    // the case where sticky was broken. Tall dialogs (FileEdit diffs) still
    // get PgUp/PgDn/wheel — same scrollRef drives the same ScrollBox.
    // Three sticky states: null (at bottom), {text,scrollTo} (scrolled up,
    // header shows), 'clicked' (just clicked header — hide it so the
    // content ❯ takes row 0). padCollapsed covers the latter two: once
    // scrolled away from bottom, padding drops to 0 and stays there until
    // repin. headerVisible is only the middle state. After click:
    // scrollBox_y=0 (header gone) + padding=0 → viewportTop=0 → ❯ at
    // row 0. On next scroll the onChange fires with a fresh {text} and
    // header comes back (viewportTop 0→1, a single 1-row shift —
    // acceptable since user explicitly scrolled).
    const sticky = hideSticky ? null : stickyPrompt
    const headerPrompt =
      sticky != null && sticky !== 'clicked' && overlay == null ? sticky : null
    const padCollapsed = sticky != null && overlay == null
    return (
      <PromptOverlayProvider>
        <Box flexGrow={1} flexDirection="column" overflow="hidden">
          {headerPrompt && (
            <StickyPromptHeader
              text={headerPrompt.text}
              onClick={headerPrompt.scrollTo}
            />
          )}
          <ScrollBox
            ref={scrollRef}
            flexGrow={1}
            flexDirection="column"
            paddingTop={padCollapsed ? 0 : 1}
            stickyScroll
          >
            <ScrollChromeContext value={chromeCtx}>
              {scrollable}
            </ScrollChromeContext>
            {overlay}
          </ScrollBox>
          {!hidePill && pillVisible && overlay == null && (
            <NewMessagesPill count={newMessageCount} onClick={onPillClick} />
          )}
          {bottomFloat != null && (
            <Box position="absolute" bottom={0} right={0} opaque>
              {bottomFloat}
            </Box>
          )}
        </Box>
        <Box flexDirection="column" flexShrink={0} width="100%" maxHeight="50%">
          <SuggestionsOverlay />
          <DialogOverlay />
          <Box
            flexDirection="column"
            width="100%"
            flexGrow={1}
            overflowY="hidden"
          >
            {bottom}
          </Box>
        </Box>
        {modal != null && (
          <ModalContext
            value={{
              rows: terminalRows - MODAL_TRANSCRIPT_PEEK - 1,
              columns: columns - 4,
              scrollRef: modalScrollRef ?? null,
            }}
          >
            {/* Bottom-anchored, grows upward to fit content. maxHeight keeps a
                few rows of transcript peek above the ▔ divider. Short modals
                (/model) sit small at the bottom with lots of transcript above;
                tall modals (/buddy Card) grow as needed, clipped by overflow.
                Previously fixed-height (top+bottom anchored) — any fixed cap
                either clipped tall content or left short content floating in
                a mostly-empty pane.

                flexShrink=0 on the inner Box is load-bearing: with Shrink=1,
                yoga squeezes deep children to h=0 when content > maxHeight,
                and sibling Texts land on the same row → ghost overlap
                ("5 serversP servers"). Clipping at the outer Box's maxHeight
                keeps children at natural size.

                Divider wrapped in flexShrink=0: when the inner box overflows
                (tall /config option list), yoga shrinks the divider Text to
                h=0 to absorb the deficit — it's the only shrinkable sibling.
                The wrapper keeps it at 1 row; overflow past maxHeight is
                clipped at the bottom by overflow=hidden instead. */}
            <Box
              position="absolute"
              bottom={0}
              left={0}
              right={0}
              maxHeight={terminalRows - MODAL_TRANSCRIPT_PEEK}
              flexDirection="column"
              overflow="hidden"
              opaque
            >
              <Box flexShrink={0}>
                <Text color="permission">{'▔'.repeat(columns)}</Text>
              </Box>
              <Box
                flexDirection="column"
                paddingX={2}
                flexShrink={0}
                overflow="hidden"
              >
                {modal}
              </Box>
            </Box>
          </ModalContext>
        )}
      </PromptOverlayProvider>
    )
  }

  return (
    <>
      {scrollable}
      {bottom}
      {overlay}
      {modal}
    </>
  )
}

// Slack-style pill. Absolute overlay at bottom={0} of the scrollwrap — floats
// over the ScrollBox's last content row, only obscuring the centered pill
// text (the rest of the row shows ScrollBox content). Scroll-smear from
// DECSTBM shifting the pill's pixels is repaired at the Ink layer
// (absoluteRectsPrev third-pass in render-node-to-output.ts, #23939). Shows
// "Jump to bottom" when count is 0 (scrolled away but no new messages yet —
// the dead zone where users previously thought chat stalled).
function NewMessagesPill({
  count,
  onClick,
}: {
  count: number
  onClick?: () => void
}): React.ReactNode {
  const [hover, setHover] = useState(false)
  return (
    <Box
      position="absolute"
      bottom={0}
      left={0}
      right={0}
      justifyContent="center"
    >
      <Box
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <Text
          backgroundColor={
            hover ? 'userMessageBackgroundHover' : 'userMessageBackground'
          }
          dimColor
        >
          {' '}
          {count > 0
            ? `${count} new ${plural(count, 'message')}`
            : 'Jump to bottom'}{' '}
          {figures.arrowDown}{' '}
        </Text>
      </Box>
    </Box>
  )
}

// Context breadcrumb: when scrolled up into history, pin the current
// conversation turn's prompt above the viewport so you know what Claude was
// responding to. Normal-flow sibling BEFORE the ScrollBox (mirrors the pill
// below it) — shrinks the ScrollBox by exactly 1 row via flex, stays outside
// the DECSTBM scroll region. Click jumps back to the prompt.
//
// Height is FIXED at 1 row (truncate-end for long prompts). A variable-height
// header (1 when short, 2 when wrapped) shifts the ScrollBox by 1 row every
// time the sticky prompt switches during scroll — content jumps on screen
// even with scrollTop unchanged (the DECSTBM region top shifts with the
// ScrollBox, and the diff engine sees "everything moved"). Fixed height
// keeps the ScrollBox anchored; only the header TEXT changes, not its box.
function StickyPromptHeader({
  text,
  onClick,
}: {
  text: string
  onClick: () => void
}): React.ReactNode {
  const [hover, setHover] = useState(false)
  return (
    <Box
      flexShrink={0}
      width="100%"
      height={1}
      paddingRight={1}
      backgroundColor={
        hover ? 'userMessageBackgroundHover' : 'userMessageBackground'
      }
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <Text color="subtle" wrap="truncate-end">
        {figures.pointer} {text}
      </Text>
    </Box>
  )
}

// Slash-command suggestion overlay — see promptOverlayContext.tsx for why
// it's portaled. Scroll-smear from floating over the DECSTBM region is
// repaired at the Ink layer (absoluteRectsPrev in render-node-to-output.ts).
// The renderer clamps negative y to 0 for absolute elements (see
// render-node-to-output.ts), so the top rows (best matches) stay visible
// even when the overlay extends above the viewport. We omit minHeight and
// flex-end here: they would create empty padding rows that shift visible
// items down into the prompt area when the list has fewer items than max.
function SuggestionsOverlay(): React.ReactNode {
  const data = usePromptOverlay()
  if (!data || data.suggestions.length === 0) return null
  return (
    <Box
      position="absolute"
      bottom="100%"
      left={0}
      right={0}
      paddingX={2}
      paddingTop={1}
      flexDirection="column"
      opaque
    >
      <PromptInputFooterSuggestions
        suggestions={data.suggestions}
        selectedSuggestion={data.selectedSuggestion}
        maxColumnWidth={data.maxColumnWidth}
        overlay
      />
    </Box>
  )
}

// Dialog portaled from PromptInput (AutoModeOptInDialog) — same clip-escape
// pattern as SuggestionsOverlay. Renders later in tree order so it paints
// over suggestions if both are ever up (they shouldn't be).
function DialogOverlay(): React.ReactNode {
  const node = usePromptOverlayDialog()
  if (!node) return null
  return (
    <Box position="absolute" bottom="100%" left={0} right={0} opaque>
      {node}
    </Box>
  )
}
