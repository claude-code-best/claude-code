import { feature } from 'bun:bundle'
import React, {
  useContext,
  useEffect,
  useEffectEvent,
  useState,
  useSyncExternalStore,
} from 'react'
import { MailboxProvider } from '../context/mailbox.js'
import { useSettingsChange } from '../hooks/useSettingsChange.js'
import { logForDebugging } from '../utils/debug.js'
import {
  createDisabledBypassPermissionsContext,
  isBypassPermissionsModeDisabled,
} from '../utils/permissions/permissionSetup.js'
import { applySettingsChange } from '../utils/settings/applySettingsChange.js'
import type { SettingSource } from '../utils/settings/constants.js'
import { createStore } from './store.js'

// DCE: voice context is ant-only. External builds get a passthrough.
/* eslint-disable @typescript-eslint/no-require-imports */
const VoiceProvider: (props: { children: React.ReactNode }) => React.ReactNode =
  feature('VOICE_MODE')
    ? require('../context/voice.js').VoiceProvider
    : ({ children }) => children

/* eslint-enable @typescript-eslint/no-require-imports */
import {
  type AppState,
  type AppStateStore,
  getDefaultAppState,
} from './AppStateStore.js'

// TODO: Remove these re-exports once all callers import directly from
// ./AppStateStore.js. Kept for back-compat during migration so .ts callers
// can incrementally move off the .tsx import and stop pulling React.
export {
  type AppState,
  type AppStateStore,
  type CompletionBoundary,
  getDefaultAppState,
  IDLE_SPECULATION_STATE,
  type SpeculationResult,
  type SpeculationState,
} from './AppStateStore.js'

export const AppStoreContext = React.createContext<AppStateStore | null>(null)

type Props = {
  children: React.ReactNode
  initialState?: AppState
  onChangeAppState?: (args: { newState: AppState; oldState: AppState }) => void
}

const HasAppStateContext = React.createContext<boolean>(false)

export function AppStateProvider({
  children,
  initialState,
  onChangeAppState,
}: Props): React.ReactNode {
  // Don't allow nested AppStateProviders.
  const hasAppStateContext = useContext(HasAppStateContext)
  if (hasAppStateContext) {
    throw new Error(
      'AppStateProvider can not be nested within another AppStateProvider',
    )
  }

  // Store is created once and never changes -- stable context value means
  // the provider never triggers re-renders. Consumers subscribe to slices
  // via useSyncExternalStore in useAppState(selector).
  const [store] = useState(() =>
    createStore<AppState>(
      initialState ?? getDefaultAppState(),
      onChangeAppState,
    ),
  )

  // Check on mount if bypass mode should be disabled
  // This handles the race condition where remote settings load BEFORE this component mounts,
  // meaning the settings change notification was sent when no listeners were subscribed.
  // On subsequent sessions, the cached remote-settings.json is read during initial setup,
  // but on the first session the remote fetch may complete before React mounts.
  useEffect(() => {
    const { toolPermissionContext } = store.getState()
    if (
      toolPermissionContext.isBypassPermissionsModeAvailable &&
      isBypassPermissionsModeDisabled()
    ) {
      logForDebugging(
        'Disabling bypass permissions mode on mount (remote settings loaded before mount)',
      )
      store.setState(prev => ({
        ...prev,
        toolPermissionContext: createDisabledBypassPermissionsContext(
          prev.toolPermissionContext,
        ),
      }))
    }
  }, [])

  // Listen for external settings changes and sync to AppState.
  // This ensures file watcher changes propagate through the app --
  // shared with the headless/SDK path via applySettingsChange.
  const onSettingsChange = useEffectEvent((source: SettingSource) =>
    applySettingsChange(source, store.setState),
  )
  useSettingsChange(onSettingsChange)

  return (
    <HasAppStateContext.Provider value={true}>
      <AppStoreContext.Provider value={store}>
        <MailboxProvider>
          <VoiceProvider>{children}</VoiceProvider>
        </MailboxProvider>
      </AppStoreContext.Provider>
    </HasAppStateContext.Provider>
  )
}

function useAppStore(): AppStateStore {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const store = useContext(AppStoreContext)
  if (!store) {
    throw new ReferenceError(
      'useAppState/useSetAppState cannot be called outside of an <AppStateProvider />',
    )
  }
  return store
}

/**
 * Subscribe to a slice of AppState. Only re-renders when the selected value
 * changes (compared via Object.is).
 *
 * For multiple independent fields, call the hook multiple times:
 * ```
 * const verbose = useAppState(s => s.verbose)
 * const model = useAppState(s => s.mainLoopModel)
 * ```
 *
 * Do NOT return new objects from the selector -- Object.is will always see
 * them as changed. Instead, select an existing sub-object reference:
 * ```
 * const { text, promptId } = useAppState(s => s.promptSuggestion) // good
 * ```
 */
export function useAppState<T>(selector: (state: AppState) => T): T {
  const store = useAppStore()

  const get = () => {
    const state = store.getState()
    const selected = selector(state)

    if (process.env.USER_TYPE === 'ant' && state === selected) {
      throw new Error(
        `Your selector in \`useAppState(${selector.toString()})\` returned the original state, which is not allowed. You must instead return a property for optimised rendering.`,
      )
    }

    return selected
  }

  return useSyncExternalStore(store.subscribe, get, get)
}

/**
 * Get the setAppState updater without subscribing to any state.
 * Returns a stable reference that never changes -- components using only
 * this hook will never re-render from state changes.
 */
export function useSetAppState(): (
  updater: (prev: AppState) => AppState,
) => void {
  return useAppStore().setState
}

/**
 * Get the store directly (for passing getState/setState to non-React code).
 */
export function useAppStateStore(): AppStateStore {
  return useAppStore()
}

const NOOP_SUBSCRIBE = () => () => {}

/**
 * Safe version of useAppState that returns undefined if called outside of AppStateProvider.
 * Useful for components that may be rendered in contexts where AppStateProvider isn't available.
 */
export function useAppStateMaybeOutsideOfProvider<T>(
  selector: (state: AppState) => T,
): T | undefined {
  const store = useContext(AppStoreContext)
  return useSyncExternalStore(store ? store.subscribe : NOOP_SUBSCRIBE, () =>
    store ? selector(store.getState()) : undefined,
  )
}
