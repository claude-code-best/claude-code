/**
 * Minimal modal context for the standalone @anthropic/ink package.
 *
 * Provides useIsInsideModal() and useModalScrollRef() used by Pane and Tabs
 * to adjust rendering when inside a FullscreenLayout modal slot.
 */

import { createContext, type RefObject, useContext } from 'react'
import type { ScrollBoxHandle } from '../components/ScrollBox.js'

type ModalCtx = {
  rows: number
  columns: number
  scrollRef: RefObject<ScrollBoxHandle | null> | null
}

export const ModalContext = createContext<ModalCtx | null>(null)

export function useIsInsideModal(): boolean {
  return useContext(ModalContext) !== null
}

export function useModalScrollRef(): RefObject<ScrollBoxHandle | null> | null {
  return useContext(ModalContext)?.scrollRef ?? null
}
