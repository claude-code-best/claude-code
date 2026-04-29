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

// DCE：语音上下文仅限内部使用。外部构建版本将获得直通处理。
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

// TODO：一旦所有调用方都直接从 ./AppStateStore.
// js 导入，就移除这些重新导出。迁移期间为保持向后兼容而保留，以便 .
// ts 调用方可以逐步弃用 .tsx 导入并停止引入 React。
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
  // 不允许嵌套 AppStateProvider。
  const hasAppStateContext = useContext(HasAppStateContext)
  if (hasAppStateContext) {
    throw new Error(
      'AppStateProvider 不能嵌套在另一个 AppStateProvider 内',
    )
  }

  // Store 创建一次且永不更改 —— 稳定的上下文值意味着 provider
  // 永远不会触发重新渲染。消费者通过 useSyncExternalStore 在
  // useAppState(selector) 中订阅切片。
  const [store] = useState(() =>
    createStore<AppState>(
      initialState ?? getDefaultAppState(),
      onChangeAppState,
    ),
  )

  // 在挂载时检查是否应禁用绕过模式。这
  // 处理了远程设置在此组件挂载之前加载的竞态条件，意味着设置更改通
  // 知在没有任何监听器订阅时已发送。在后续会话中，缓存的 rem
  // ote-settings.json 在初始设置期间读取，但在
  // 首次会话中，远程获取可能在 React 挂载之前完成。
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

  // 监听外部设置更改并同步到 AppState。这确保文
  // 件监视器的更改能在应用中传播 —— 通过 applySe
  // ttingsChange 与无头/SDK 路径共享。
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
  const store = useAppStore()

  const get = () => {
    const state = store.getState()
    const selected = selector(state)

    if (process.env.USER_TYPE === 'ant' && state === selected) {
      throw new Error(
        `您在 \`useAppState(${selector.toString()})\` 中的选择器返回了原始状态，这是不允许的。您必须改为返回一个属性以实现优化渲染。`,
      )
    }

    return selected
  }

  return useSyncExternalStore(store.subscribe, get, get)
}

/** * 获取 setAppState 更新器，无需订阅任何状态。
 * 返回一个永不更改的稳定引用 —— 仅使用此钩子的组件永远不会因状态更改而重新渲染。 */
export function useSetAppState(): (
  updater: (prev: AppState) => AppState,
) => void {
  return useAppStore().setState
}

/** * 直接获取 store（用于将 getState/setState 传递给非 React 代码）。 */
export function useAppStateStore(): AppStateStore {
  return useAppStore()
}

const NOOP_SUBSCRIBE = () => () => {}

/** * useAppState 的安全版本，如果在 AppStateProvider 外部调用则返回 undefined。
 * 适用于可能在 AppStateProvider 不可用的上下文中渲染的组件。 */
export function useAppStateMaybeOutsideOfProvider<T>(
  selector: (state: AppState) => T,
): T | undefined {
  const store = useContext(AppStoreContext)
  return useSyncExternalStore(store ? store.subscribe : NOOP_SUBSCRIBE, () =>
    store ? selector(store.getState()) : undefined,
  )
}
