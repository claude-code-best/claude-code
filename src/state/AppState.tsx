import { feature } from 'bun:bundle';
import React, { useContext, useEffect, useEffectEvent, useState, useSyncExternalStore } from 'react';
import { MailboxProvider } from '../context/mailbox.js';
import { useSettingsChange } from '../hooks/useSettingsChange.js';
import { logForDebugging } from '../utils/debug.js';
import {
  createDisabledBypassPermissionsContext,
  isBypassPermissionsModeDisabled,
} from '../utils/permissions/permissionSetup.js';
import { applySettingsChange } from '../utils/settings/applySettingsChange.js';
import type { SettingSource } from '../utils/settings/constants.js';
import { createStore } from './store.js';

// DCE：语音上下文仅限内部使用。外部构建版本将获得直通处理。
/* eslint-disable @typescript-eslint/no-require-imports */
const VoiceProvider: (props: { children: React.ReactNode }) => React.ReactNode = feature('VOICE_MODE')
  ? require('../context/voice.js').VoiceProvider
  : ({ children }) => children;

/* eslint-enable @typescript-eslint/no-require-imports */
import { type AppState, type AppStateStore, getDefaultAppState } from './AppStateStore.js';

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
} from './AppStateStore.js';

export const AppStoreContext = React.createContext<AppStateStore | null>(null);

type Props = {
  children: React.ReactNode;
  initialState?: AppState;
  onChangeAppState?: (args: { newState: AppState; oldState: AppState }) => void;
};

const HasAppStateContext = React.createContext<boolean>(false);

export function AppStateProvider({ children, initialState, onChangeAppState }: Props): React.ReactNode {
  // Don't allow nested AppStateProviders.
  const hasAppStateContext = useContext(HasAppStateContext);
  if (hasAppStateContext) {
    throw new Error('AppStateProvider can not be nested within another AppStateProvider');
  }

  // Store is created once and never changes -- stable context value means
  // the provider never triggers re-renders. Consumers subscribe to slices
  // via useSyncExternalStore in useAppState(selector).
  const [store] = useState(() => createStore<AppState>(initialState ?? getDefaultAppState(), onChangeAppState));

  // 在挂载时检查是否应禁用绕过模式。这
  // 处理了远程设置在此组件挂载之前加载的竞态条件，意味着设置更改通
  // 知在没有任何监听器订阅时已发送。在后续会话中，缓存的 rem
  // ote-settings.json 在初始设置期间读取，但在
  // 首次会话中，远程获取可能在 React 挂载之前完成。
  useEffect(() => {
    const { toolPermissionContext } = store.getState();
    if (toolPermissionContext.isBypassPermissionsModeAvailable && isBypassPermissionsModeDisabled()) {
      logForDebugging('Disabling bypass permissions mode on mount (remote settings loaded before mount)');
      store.setState(prev => ({
        ...prev,
        toolPermissionContext: createDisabledBypassPermissionsContext(prev.toolPermissionContext),
      }));
    }
  }, []);

  // Listen for external settings changes and sync to AppState.
  // This ensures file watcher changes propagate through the app --
  // shared with the headless/SDK path via applySettingsChange.
  const onSettingsChange = useEffectEvent((source: SettingSource) => applySettingsChange(source, store.setState));
  useSettingsChange(onSettingsChange);

  return (
    <HasAppStateContext.Provider value={true}>
      <AppStoreContext.Provider value={store}>
        <MailboxProvider>
          <VoiceProvider>{children}</VoiceProvider>
        </MailboxProvider>
      </AppStoreContext.Provider>
    </HasAppStateContext.Provider>
  );
}

function useAppStore(): AppStateStore {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const store = useContext(AppStoreContext);
  if (!store) {
    throw new ReferenceError('useAppState/useSetAppState cannot be called outside of an <AppStateProvider />');
  }
  return store;
}

/** * 订阅 AppState 的一个切片。仅当所选值更改时重新渲染（通过 Object.is 比较）。
 *
 * 对于多个独立字段，多次调用此钩子：
 * ```
 * const verbose = useAppState(s => s.verbose)
 * const model = useAppState(s => s.mainLoopModel)
 * ```
 *
 * 请勿从选择器返回新对象 —— Object.is 将始终将其视为已更改。相反，选择现有的子对象引用：
 * ```
 * const { text, promptId } = useAppState(s => s.promptSuggestion) // 正确
 * ``` */
export function useAppState<T>(selector: (state: AppState) => T): T {
  const store = useAppStore();

  const get = () => {
    const state = store.getState();
    const selected = selector(state);

    if (process.env.USER_TYPE === 'ant' && state === selected) {
      throw new Error(
        `Your selector in \`useAppState(${selector.toString()})\` returned the original state, which is not allowed. You must instead return a property for optimised rendering.`,
      );
    }

    return selected;
  };

  return useSyncExternalStore(store.subscribe, get, get);
}

/**
 * Get the setAppState updater without subscribing to any state.
 * Returns a stable reference that never changes -- components using only
 * this hook will never re-render from state changes.
 */
export function useSetAppState(): (updater: (prev: AppState) => AppState) => void {
  return useAppStore().setState;
}

/** * 直接获取 store（用于将 getState/setState 传递给非 React 代码）。 */
export function useAppStateStore(): AppStateStore {
  return useAppStore();
}

const NOOP_SUBSCRIBE = () => () => {};

/**
 * Safe version of useAppState that returns undefined if called outside of AppStateProvider.
 * Useful for components that may be rendered in contexts where AppStateProvider isn't available.
 */
export function useAppStateMaybeOutsideOfProvider<T>(selector: (state: AppState) => T): T | undefined {
  const store = useContext(AppStoreContext);
  return useSyncExternalStore(store ? store.subscribe : NOOP_SUBSCRIBE, () =>
    store ? selector(store.getState()) : undefined,
  );
}
