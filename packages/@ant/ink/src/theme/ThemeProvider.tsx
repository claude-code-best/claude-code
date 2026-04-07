import { feature } from 'bun:bundle'
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import useStdin from '../hooks/use-stdin.js'
import { getSystemThemeName, type SystemTheme } from './systemTheme.js'
import type { ThemeName, ThemeSetting } from './theme-types.js'

// -- Config persistence injection --
// Business layer provides these via setThemeConfigCallbacks().
// Defaults read/write from a simple module-level store.

let _loadTheme: () => ThemeSetting = () => 'dark'
let _saveTheme: (setting: ThemeSetting) => void = () => {}

/** Inject config persistence from the business layer. Call once at startup. */
export function setThemeConfigCallbacks(opts: {
  loadTheme: () => ThemeSetting
  saveTheme: (setting: ThemeSetting) => void
}): void {
  _loadTheme = opts.loadTheme
  _saveTheme = opts.saveTheme
}

type ThemeContextValue = {
  /** The saved user preference. May be 'auto'. */
  themeSetting: ThemeSetting
  setThemeSetting: (setting: ThemeSetting) => void
  setPreviewTheme: (setting: ThemeSetting) => void
  savePreview: () => void
  cancelPreview: () => void
  /** The resolved theme to render with. Never 'auto'. */
  currentTheme: ThemeName
}

// Non-'auto' default so useTheme() works without a provider (tests, tooling).
const DEFAULT_THEME: ThemeName = 'dark'

const ThemeContext = createContext<ThemeContextValue>({
  themeSetting: DEFAULT_THEME,
  setThemeSetting: () => {},
  setPreviewTheme: () => {},
  savePreview: () => {},
  cancelPreview: () => {},
  currentTheme: DEFAULT_THEME,
})

type Props = {
  children: React.ReactNode
  initialState?: ThemeSetting
  onThemeSave?: (setting: ThemeSetting) => void
}

function defaultInitialTheme(): ThemeSetting {
  return _loadTheme()
}

function defaultSaveTheme(setting: ThemeSetting): void {
  _saveTheme(setting)
}

export function ThemeProvider({
  children,
  initialState,
  onThemeSave = defaultSaveTheme,
}: Props) {
  const [themeSetting, setThemeSetting] = useState(
    initialState ?? defaultInitialTheme,
  )
  const [previewTheme, setPreviewTheme] = useState<ThemeSetting | null>(null)

  // Track terminal theme for 'auto' resolution. Seeds from $COLORFGBG (or
  // 'dark' if unset); the OSC 11 watcher corrects it on first poll.
  const [systemTheme, setSystemTheme] = useState<SystemTheme>(() =>
    (initialState ?? themeSetting) === 'auto' ? getSystemThemeName() : 'dark',
  )

  // The setting currently in effect (preview wins while picker is open)
  const activeSetting = previewTheme ?? themeSetting

  const { internal_querier } = useStdin()

  // Watch for live terminal theme changes while 'auto' is active.
  // Positive feature() pattern so the watcher import is dead-code-eliminated
  // in external builds.
  useEffect(() => {
    if (feature('AUTO_THEME')) {
      if (activeSetting !== 'auto' || !internal_querier) return
      let cleanup: (() => void) | undefined
      let cancelled = false
      void import('../../utils/systemThemeWatcher.js').then(
        ({ watchSystemTheme }) => {
          if (cancelled) return
          cleanup = watchSystemTheme(internal_querier, setSystemTheme)
        },
      )
      return () => {
        cancelled = true
        cleanup?.()
      }
    }
  }, [activeSetting, internal_querier])

  const currentTheme: ThemeName =
    activeSetting === 'auto' ? systemTheme : activeSetting

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeSetting,
      setThemeSetting: (newSetting: ThemeSetting) => {
        setThemeSetting(newSetting)
        setPreviewTheme(null)
        // Switching to 'auto' restarts the watcher (activeSetting dep), whose
        // first poll fires immediately. Seed from the cache so the OSC
        // round-trip doesn't flash the wrong palette.
        if (newSetting === 'auto') {
          setSystemTheme(getSystemThemeName())
        }
        onThemeSave?.(newSetting)
      },
      setPreviewTheme: (newSetting: ThemeSetting) => {
        setPreviewTheme(newSetting)
        if (newSetting === 'auto') {
          setSystemTheme(getSystemThemeName())
        }
      },
      savePreview: () => {
        if (previewTheme !== null) {
          setThemeSetting(previewTheme)
          setPreviewTheme(null)
          onThemeSave?.(previewTheme)
        }
      },
      cancelPreview: () => {
        if (previewTheme !== null) {
          setPreviewTheme(null)
        }
      },
      currentTheme,
    }),
    [themeSetting, previewTheme, currentTheme, onThemeSave],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

/**
 * Returns the resolved theme for rendering (never 'auto') and a setter that
 * accepts any ThemeSetting (including 'auto').
 */
export function useTheme(): [ThemeName, (setting: ThemeSetting) => void] {
  const { currentTheme, setThemeSetting } = useContext(ThemeContext)
  return [currentTheme, setThemeSetting]
}

/**
 * Returns the raw theme setting as stored in config. Use this in UI that
 * needs to show 'auto' as a distinct choice (e.g., ThemePicker).
 */
export function useThemeSetting(): ThemeSetting {
  return useContext(ThemeContext).themeSetting
}

export function usePreviewTheme() {
  const { setPreviewTheme, savePreview, cancelPreview } =
    useContext(ThemeContext)
  return { setPreviewTheme, savePreview, cancelPreview }
}
