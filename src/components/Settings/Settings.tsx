// biome-ignore-all assist/source/organizeImports: ANT-ONLY import markers must not be reordered
import * as React from 'react'
import { Suspense, useState } from 'react'
import { useKeybinding } from '../../keybindings/useKeybinding.js'
import { useExitOnCtrlCDWithKeybindings } from '../../hooks/useExitOnCtrlCDWithKeybindings.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import {
  useIsInsideModal,
  useModalOrTerminalSize,
} from '../../context/modalContext.js'
import { Pane, Tab, Tabs } from '@anthropic/ink'
import { Status, buildDiagnostics } from './Status.js'
import { Config } from './Config.js'
import { Usage } from './Usage.js'
import type {
  LocalJSXCommandContext,
  CommandResultDisplay,
} from '../../commands.js'

type Props = {
  onClose: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void
  context: LocalJSXCommandContext
  defaultTab: 'Status' | 'Config' | 'Usage'
}

export function Settings({
  onClose,
  context,
  defaultTab,
}: Props): React.ReactNode {
  const [selectedTab, setSelectedTab] = useState<string>(defaultTab)
  const [tabsHidden, setTabsHidden] = useState(false)
  // True while Config's own Esc handler is active (search mode with content
  // focused). Settings must cede Esc so search can clear/exit first.
  const [configOwnsEsc, setConfigOwnsEsc] = useState(false)
  // Fixed content height so switching tabs doesn't shift the pane height.
  // Outside modals cap at min(80% viewport, 30). Inside a Modal the modal's
  // innerSize.rows IS the ScrollBox viewport — the 0.8 multiplier over-
  // shrinks, leaving empty rows while Config shows "↓ N more below".
  //
  // Inside-modal math: Config's paneCap-10 chrome estimate was tuned for
  // marginY={1} (2 rows) which is stripped inside modals → +2 to recover.
  // Then -2 for Tabs' header row + its marginTop=1. Plus +1 observed gap
  // from the paneCap-10 estimate being slightly generous. Net: rows + 1.
  const insideModal = useIsInsideModal()
  const { rows } = useModalOrTerminalSize(useTerminalSize())
  const contentHeight = insideModal
    ? rows + 1
    : Math.max(15, Math.min(Math.floor(rows * 0.8), 30))
  // Kick off diagnostics once when the pane opens. Status use()s this so
  // it resolves once per /config invocation — no re-fetch flash when
  // tabbing back to Status (Tab unmounts children when not selected).
  const [diagnosticsPromise] = useState(() =>
    buildDiagnostics().catch(() => []),
  )

  useExitOnCtrlCDWithKeybindings()

  // Handle escape via keybinding - only when not in submenu
  const handleEscape = () => {
    // Don't handle escape when a submenu is showing (tabsHidden means submenu is open)
    // Let the submenu handle escape to return to the main menu
    if (tabsHidden) {
      return
    }
    // TODO: Update to "Settings" dialog once we define '/settings'.
    onClose('Status dialog dismissed', { display: 'system' })
  }

  // Disable when submenu is open so the submenu's Dialog can handle ESC,
  // and when Config's search mode is active so its useInput handler
  // (clear query → exit search) processes Escape first.
  useKeybinding('confirm:no', handleEscape, {
    context: 'Settings',
    isActive:
      !tabsHidden &&
      !(selectedTab === 'Config' && configOwnsEsc),
  })

  const tabs = [
    <Tab key="status" title="Status">
      <Status context={context} diagnosticsPromise={diagnosticsPromise} />
    </Tab>,
    <Tab key="config" title="Config">
      <Suspense fallback={null}>
        <Config
          context={context}
          onClose={onClose}
          setTabsHidden={setTabsHidden}
          onIsSearchModeChange={setConfigOwnsEsc}
          contentHeight={contentHeight}
        />
      </Suspense>
    </Tab>,
    <Tab key="usage" title="Usage">
      <Usage />
    </Tab>,
  ]

  return (
    <Pane color="permission">
      <Tabs
        color="permission"
        selectedTab={selectedTab}
        onTabChange={setSelectedTab}
        hidden={tabsHidden}
        // Config has interactive content — start with header unfocused so
        // left/right/tab cycle option values instead of switching tabs.
        initialHeaderFocused={defaultTab !== 'Config'}
        // Inside a Modal, skip the Tabs-level cap so tall tabs (Status's
        // MCP list) flow to their natural height for the Modal's ScrollBox
        // to scroll. Config still gets contentHeight above — it
        // paginate internally so this only affects Status/Usage.
        contentHeight={tabsHidden || insideModal ? undefined : contentHeight}
      >
        {tabs}
      </Tabs>
    </Pane>
  )
}
