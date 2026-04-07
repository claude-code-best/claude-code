import { createContext, type RefObject, useContext } from 'react'
import type { ScrollBoxHandle } from '@anthropic/ink'

/**
 * Set by FullscreenLayout when rendering content in its `modal` slot —
 * the absolute-positioned bottom-anchored pane for slash-command dialogs.
 * Consumers use this to:
 *
 * - Suppress top-level framing — `Pane` skips its full-terminal-width
 *   `Divider` (FullscreenLayout already draws the ▔ divider).
 * - Size Select pagination to the available rows — the modal's inner
 *   area is smaller than the terminal (rows minus transcript peek minus
 *   divider), so components that cap their visible option count from
 *   `useTerminalSize().rows` would overflow without this context.
 * - Reset scroll on tab switch — Tabs keys its ScrollBox by
 *   `selectedTabIndex`, remounting on tab switch so scrollTop resets to 0
 *   without scrollTo() timing games.
 *
 * null = not inside the modal slot.
 */
type ModalCtx = {
  rows: number
  columns: number
  scrollRef: RefObject<ScrollBoxHandle | null> | null
}
export const ModalContext = createContext<ModalCtx | null>(null)

export function useIsInsideModal(): boolean {
  return useContext(ModalContext) !== null
}

/**
 * Available content rows/columns when inside a Modal, else falls back to
 * the provided terminal size. Use instead of `useTerminalSize()` when a
 * component caps its visible content height — the modal's inner area is
 * smaller than the terminal.
 */
export function useModalOrTerminalSize(fallback: {
  rows: number
  columns: number
}): { rows: number; columns: number } {
  const ctx = useContext(ModalContext)
  return ctx ? { rows: ctx.rows, columns: ctx.columns } : fallback
}

export function useModalScrollRef(): RefObject<ScrollBoxHandle | null> | null {
  return useContext(ModalContext)?.scrollRef ?? null
}
