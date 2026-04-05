/**
 * Portal for content that floats above the prompt so it escapes
 * FullscreenLayout's bottom-slot `overflowY:hidden` clip.
 *
 * The clip is load-bearing (CC-668: tall pastes squash the ScrollBox
 * without it), but floating overlays use `position:absolute
 * bottom="100%"` to float above the prompt — and Ink's clip stack
 * intersects ALL descendants, so they were clipped to ~1 row.
 *
 * Two channels:
 * - `useSetPromptOverlay` — slash-command suggestion data (structured,
 *   written by PromptInputFooter)
 * - `useSetPromptOverlayDialog` — arbitrary dialog node (e.g.
 *   AutoModeOptInDialog, written by PromptInput)
 *
 * FullscreenLayout reads both and renders them outside the clipped slot.
 *
 * Split into data/setter context pairs so writers never re-render on
 * their own writes — the setter contexts are stable.
 */
import React, {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react'
import type { SuggestionItem } from '../components/PromptInput/PromptInputFooterSuggestions.js'

export type PromptOverlayData = {
  suggestions: SuggestionItem[]
  selectedSuggestion: number
  maxColumnWidth?: number
}

type Setter<T> = (d: T | null) => void

const DataContext = createContext<PromptOverlayData | null>(null)
const SetContext = createContext<Setter<PromptOverlayData> | null>(null)
const DialogContext = createContext<ReactNode>(null)
const SetDialogContext = createContext<Setter<ReactNode> | null>(null)

export function PromptOverlayProvider({
  children,
}: {
  children: ReactNode
}): ReactNode {
  const [data, setData] = useState<PromptOverlayData | null>(null)
  const [dialog, setDialog] = useState<ReactNode>(null)
  return (
    <SetContext.Provider value={setData}>
      <SetDialogContext.Provider value={setDialog}>
        <DataContext.Provider value={data}>
          <DialogContext.Provider value={dialog}>
            {children}
          </DialogContext.Provider>
        </DataContext.Provider>
      </SetDialogContext.Provider>
    </SetContext.Provider>
  )
}

export function usePromptOverlay(): PromptOverlayData | null {
  return useContext(DataContext)
}

export function usePromptOverlayDialog(): ReactNode {
  return useContext(DialogContext)
}

/**
 * Register suggestion data for the floating overlay. Clears on unmount.
 * No-op outside the provider (non-fullscreen renders inline instead).
 */
export function useSetPromptOverlay(data: PromptOverlayData | null): void {
  const set = useContext(SetContext)
  useEffect(() => {
    if (!set) return
    set(data)
    return () => set(null)
  }, [set, data])
}

/**
 * Register a dialog node to float above the prompt. Clears on unmount.
 * No-op outside the provider (non-fullscreen renders inline instead).
 */
export function useSetPromptOverlayDialog(node: ReactNode): void {
  const set = useContext(SetDialogContext)
  useEffect(() => {
    if (!set) return
    set(node)
    return () => set(null)
  }, [set, node])
}
