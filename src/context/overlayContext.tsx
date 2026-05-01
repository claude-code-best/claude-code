/**
 * Overlay tracking for Escape key coordination.
 *
 * This solves the problem of escape key handling when overlays (like Select with onCancel)
 * are open. The CancelRequestHandler needs to know when an overlay is active so it doesn't
 * cancel requests when the user just wants to dismiss the overlay.
 *
 * Usage:
 * 1. Call useRegisterOverlay() in any overlay component to automatically register it
 * 2. Call useIsOverlayActive() to check if any overlay is currently active
 *
 * The hook automatically registers on mount and unregisters on unmount,
 * so no manual cleanup or state management is needed.
 */
import { useContext, useEffect, useLayoutEffect } from 'react';
import { instances } from '@anthropic/ink';
import { AppStoreContext, useAppState } from '../state/AppState.js';

// Non-modal overlays that shouldn't disable TextInput focus
const NON_MODAL_OVERLAYS = new Set(['autocomplete']);

/**
 * Hook to register a component as an active overlay.
 * Automatically registers on mount and unregisters on unmount.
 *
 * @param id - Unique identifier for this overlay (e.g., 'select', 'multi-select')
 * @param enabled - Whether to register (default: true). Use this to conditionally register
 *                  based on component props, e.g., only register when onCancel is provided.
 *
 * @example
 * // Conditional registration based on whether cancel is supported
 * function useSelectInput({ state }) {
 *   useRegisterOverlay('select', !!state.onCancel)
 *   // ...
 * }
 */
export function useRegisterOverlay(id: string, enabled = true): void {
  // Use context directly so this is a no-op when rendered outside AppStateProvider
  // (e.g., in isolated component tests that don't need the full app state tree).
  const store = useContext(AppStoreContext);
  const setAppState = store?.setState;
  useEffect(() => {
    if (!enabled || !setAppState) return;
    setAppState(prev => {
      if (prev.activeOverlays.has(id)) return prev;
      const next = new Set(prev.activeOverlays);
      next.add(id);
      return { ...prev, activeOverlays: next };
    });
    return () => {
      setAppState(prev => {
        if (!prev.activeOverlays.has(id)) return prev;
        const next = new Set(prev.activeOverlays);
        next.delete(id);
        return { ...prev, activeOverlays: next };
      });
    };
  }, [id, enabled, setAppState]);

  // On overlay close, force the next render to full-damage diff instead
  // of blit. A tall overlay (e.g. FuzzyPicker with a 20-line preview)
  // shrinks the Ink-managed region on unmount; the blit fast path can
  // copy stale cells from the overlay's previous frame into rows the
  // shorter layout no longer reaches, leaving a ghost title/divider.
  // useLayoutEffect so cleanup runs synchronously before the microtask-
  // deferred onRender (scheduleRender queues a microtask from
  // resetAfterCommit; passive-effect cleanup would land after it).
  useLayoutEffect(() => {
    if (!enabled) return;
    return () => instances.get(process.stdout)?.invalidatePrevFrame();
  }, [enabled]);
}

/**
 * Hook to check if any overlay is currently active.
 * This is reactive - the component will re-render when the overlay state changes.
 *
 * @returns true if any overlay is currently active
 *
 * @example
 * function CancelRequestHandler() {
 *   const isOverlayActive = useIsOverlayActive()
 *   const isActive = !isOverlayActive && canCancelRunningTask
 *   useKeybinding('chat:cancel', handleCancel, { isActive })
 * }
 */
export function useIsOverlayActive(): boolean {
  return useAppState(s => s.activeOverlays.size > 0);
}

/**
 * Hook to check if any modal overlay is currently active.
 * Modal overlays are overlays that should capture all input (like Select dialogs).
 * Non-modal overlays (like autocomplete) don't disable TextInput focus.
 *
 * @returns true if any modal overlay is currently active
 *
 * @example
 * // Use for TextInput focus - allows typing during autocomplete
 * focus: !isSearchingHistory && !isModalOverlayActive
 */
export function useIsModalOverlayActive(): boolean {
  return useAppState(s => {
    for (const id of s.activeOverlays) {
      if (!NON_MODAL_OVERLAYS.has(id)) return true;
    }
    return false;
  });
}
