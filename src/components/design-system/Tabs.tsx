import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import {
  useIsInsideModal,
  useModalScrollRef,
} from '../../context/modalContext.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import ScrollBox from '../../ink/components/ScrollBox.js'
import type { KeyboardEvent } from '../../ink/events/keyboard-event.js'
import { stringWidth } from '../../ink/stringWidth.js'
import { Box, Text } from '../../ink.js'
import { useKeybindings } from '../../keybindings/useKeybinding.js'
import type { Theme } from '../../utils/theme.js'

type TabsProps = {
  children: Array<React.ReactElement<TabProps>>
  title?: string
  color?: keyof Theme
  defaultTab?: string
  hidden?: boolean
  useFullWidth?: boolean
  /** Controlled mode: current selected tab id/title */
  selectedTab?: string
  /** Controlled mode: callback when tab changes */
  onTabChange?: (tabId: string) => void
  /** Optional banner to display below tabs header */
  banner?: React.ReactNode
  /** Disable keyboard navigation (e.g. when a child component handles arrow keys) */
  disableNavigation?: boolean
  /**
   * Initial focus state for the tab header row. Defaults to true (header
   * focused, nav always works). Keep the default for Select/list content —
   * those only use up/down so there's no conflict; pass
   * isDisabled={headerFocused} to the Select instead. Only set false when
   * content actually binds left/right/tab (e.g. enum cycling), and show a
   * "↑ tabs" footer hint — without it tabs look broken.
   */
  initialHeaderFocused?: boolean
  /**
   * Fixed height for the content area. When set, all tabs render within the
   * same height (overflow hidden) so switching tabs doesn't cause layout
   * shifts. Shorter tabs get whitespace; taller tabs are clipped.
   */
  contentHeight?: number
  /**
   * Let Tab/←/→ switch tabs from focused content. Opt-in since some
   * content uses those keys; pass a reactive boolean to cede them when
   * needed. Switching from content focuses the header.
   */
  navFromContent?: boolean
}

type TabsContextValue = {
  selectedTab: string | undefined
  width: number | undefined
  headerFocused: boolean
  focusHeader: () => void
  blurHeader: () => void
  registerOptIn: () => () => void
}

const TabsContext = createContext<TabsContextValue>({
  selectedTab: undefined,
  width: undefined,
  // Default for components rendered outside a Tabs (tests, standalone):
  // content has focus, focusHeader is a no-op.
  headerFocused: false,
  focusHeader: () => {},
  blurHeader: () => {},
  registerOptIn: () => () => {},
})

export function Tabs({
  title,
  color,
  defaultTab,
  children,
  hidden,
  useFullWidth,
  selectedTab: controlledSelectedTab,
  onTabChange,
  banner,
  disableNavigation,
  initialHeaderFocused = true,
  contentHeight,
  navFromContent = false,
}: TabsProps): React.ReactNode {
  const { columns: terminalWidth } = useTerminalSize()
  const tabs = children.map(child => [
    child.props.id ?? child.props.title,
    child.props.title,
  ])
  const defaultTabIndex = defaultTab
    ? tabs.findIndex(tab => defaultTab === tab[0])
    : 0

  // Support both controlled and uncontrolled modes
  const isControlled = controlledSelectedTab !== undefined
  const [internalSelectedTab, setInternalSelectedTab] = useState(
    defaultTabIndex !== -1 ? defaultTabIndex : 0,
  )

  // In controlled mode, find the index of the controlled tab
  const controlledTabIndex = isControlled
    ? tabs.findIndex(tab => tab[0] === controlledSelectedTab)
    : -1
  const selectedTabIndex = isControlled
    ? controlledTabIndex !== -1
      ? controlledTabIndex
      : 0
    : internalSelectedTab

  const modalScrollRef = useModalScrollRef()

  // Header focus: left/right/tab only switch tabs when the header row is
  // focused. Children with interactive content call focusHeader() (via
  // useTabHeaderFocus) on up-arrow to hand focus back here; down-arrow
  // returns it. Tabs that never call the hook see no behavior change —
  // initialHeaderFocused defaults to true so nav always works.
  const [headerFocused, setHeaderFocused] = useState(initialHeaderFocused)
  const focusHeader = useCallback(() => setHeaderFocused(true), [])
  const blurHeader = useCallback(() => setHeaderFocused(false), [])
  // Count of mounted children using useTabHeaderFocus(). Down-arrow blur and
  // the ↓ hint only engage when at least one child has opted in — otherwise
  // pressing down on a legacy tab would strand the user with nav disabled.
  const [optInCount, setOptInCount] = useState(0)
  const registerOptIn = useCallback(() => {
    setOptInCount(n => n + 1)
    return () => setOptInCount(n => n - 1)
  }, [])
  const optedIn = optInCount > 0

  const handleTabChange = (offset: number) => {
    const newIndex = (selectedTabIndex + tabs.length + offset) % tabs.length
    const newTabId = tabs[newIndex]?.[0]

    if (isControlled && onTabChange && newTabId) {
      onTabChange(newTabId)
    } else {
      setInternalSelectedTab(newIndex)
    }
    // Tab switching is a header action — stay focused so the user can keep
    // cycling. The newly mounted tab can blur via its own interaction.
    setHeaderFocused(true)
  }

  useKeybindings(
    {
      'tabs:next': () => handleTabChange(1),
      'tabs:previous': () => handleTabChange(-1),
    },
    {
      context: 'Tabs',
      isActive: !hidden && !disableNavigation && headerFocused,
    },
  )

  // When the header is focused, down-arrow returns focus to content. Only
  // active when the selected tab has opted in via useTabHeaderFocus() —
  // legacy tabs have nowhere to return focus to.
  const handleKeyDown = (e: KeyboardEvent) => {
    if (!headerFocused || !optedIn || hidden) return
    if (e.key === 'down') {
      e.preventDefault()
      setHeaderFocused(false)
    }
  }

  // Opt-in: same tabs:next/previous actions, active from content. Focuses
  // the header so subsequent presses cycle via the handler above.
  useKeybindings(
    {
      'tabs:next': () => {
        handleTabChange(1)
        setHeaderFocused(true)
      },
      'tabs:previous': () => {
        handleTabChange(-1)
        setHeaderFocused(true)
      },
    },
    {
      context: 'Tabs',
      isActive:
        navFromContent &&
        !headerFocused &&
        optedIn &&
        !hidden &&
        !disableNavigation,
    },
  )

  // Calculate spacing to fill the available width. No keyboard hint in the
  // header row — content footers own hints (see useTabHeaderFocus docs).
  const titleWidth = title ? stringWidth(title) + 1 : 0 // +1 for gap
  const tabsWidth = tabs.reduce(
    (sum, [, tabTitle]) => sum + (tabTitle ? stringWidth(tabTitle) : 0) + 2 + 1, // +2 for padding, +1 for gap
    0,
  )
  const usedWidth = titleWidth + tabsWidth
  const spacerWidth = useFullWidth ? Math.max(0, terminalWidth - usedWidth) : 0

  const contentWidth = useFullWidth ? terminalWidth : undefined

  return (
    <TabsContext.Provider
      value={{
        selectedTab: tabs[selectedTabIndex]![0],
        width: contentWidth,
        headerFocused,
        focusHeader,
        blurHeader,
        registerOptIn,
      }}
    >
      <Box
        flexDirection="column"
        tabIndex={0}
        autoFocus
        onKeyDown={handleKeyDown}
        // flexShrink=0 inside modal slot — the modal's absolute Box has no
        // explicit height (grows to fit, maxHeight cap), so flexGrow=1 here
        // resolves to 0 on re-render and the body blanks on Down arrow.
        // See #23592. Outside modal, leave layout alone.
        flexShrink={modalScrollRef ? 0 : undefined}
      >
        {!hidden && (
          <Box
            flexDirection="row"
            gap={1}
            flexShrink={modalScrollRef ? 0 : undefined}
          >
            {title !== undefined && (
              <Text bold color={color}>
                {title}
              </Text>
            )}
            {tabs.map(([id, title], i) => {
              const isCurrent = selectedTabIndex === i
              const hasColorCursor = color && isCurrent && headerFocused
              return (
                <Text
                  key={id}
                  backgroundColor={hasColorCursor ? color : undefined}
                  color={hasColorCursor ? 'inverseText' : undefined}
                  inverse={isCurrent && !hasColorCursor}
                  bold={isCurrent}
                >
                  {' '}
                  {title}{' '}
                </Text>
              )
            })}
            {spacerWidth > 0 && <Text>{' '.repeat(spacerWidth)}</Text>}
          </Box>
        )}
        {banner}
        {modalScrollRef ? (
          // Inside the modal slot: own the ScrollBox here so the tabs
          // header row above sits OUTSIDE the scroll area — it can never
          // scroll off. The ref reaches REPL's ScrollKeybindingHandler via
          // ModalContext. Keyed by selectedTabIndex → remounts on tab
          // switch, resetting scrollTop to 0 without scrollTo() timing games.
          <Box width={contentWidth} marginTop={hidden ? 0 : 1} flexShrink={0}>
            <ScrollBox
              key={selectedTabIndex}
              ref={modalScrollRef}
              flexDirection="column"
              flexShrink={0}
            >
              {children}
            </ScrollBox>
          </Box>
        ) : (
          <Box
            width={contentWidth}
            marginTop={hidden ? 0 : 1}
            height={contentHeight}
            overflowY={contentHeight !== undefined ? 'hidden' : undefined}
          >
            {children}
          </Box>
        )}
      </Box>
    </TabsContext.Provider>
  )
}

type TabProps = {
  title: string
  id?: string
  children: React.ReactNode
}

export function Tab({ title, id, children }: TabProps): React.ReactNode {
  const { selectedTab, width } = useContext(TabsContext)
  const insideModal = useIsInsideModal()
  if (selectedTab !== (id ?? title)) {
    return null
  }

  return (
    <Box width={width} flexShrink={insideModal ? 0 : undefined}>
      {children}
    </Box>
  )
}

export function useTabsWidth(): number | undefined {
  const { width } = useContext(TabsContext)
  return width
}

/**
 * Opt into header-focus gating. Returns the current header focus state and a
 * callback to hand focus back to the tab row. For a Select, pass
 * `isDisabled={headerFocused}` and `onUpFromFirstItem={focusHeader}`; keep the
 * parent Tabs' initialHeaderFocused at its default so tab/←/→ work on mount.
 *
 * Calling this hook registers a ↓-blurs-header opt-in on mount. Don't call it
 * above an early return that renders static text — ↓ will blur the header with
 * no onUpFromFirstItem to recover. Split the component so the hook only runs
 * when the Select renders.
 */
export function useTabHeaderFocus(): {
  headerFocused: boolean
  focusHeader: () => void
  blurHeader: () => void
} {
  const { headerFocused, focusHeader, blurHeader, registerOptIn } =
    useContext(TabsContext)
  useEffect(registerOptIn, [registerOptIn])
  return { headerFocused, focusHeader, blurHeader }
}
