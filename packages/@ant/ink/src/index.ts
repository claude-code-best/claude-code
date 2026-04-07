/**
 * @anthropic/ink — Terminal React rendering framework
 *
 * Three-layer architecture:
 *   core/        — Rendering engine (reconciler, layout, terminal I/O, screen buffer)
 *   components/  — UI primitives (Box, Text, ScrollBox, App, hooks)
 *   theme/       — Theme system (ThemeProvider, ThemedBox, ThemedText, design-system)
 */

// ============================================================
// Core API (render/createRoot)
// ============================================================
export { default as wrappedRender, renderSync, createRoot } from './core/root.js'
export type { RenderOptions, Instance, Root } from './core/root.js'

// InkCore class
export { default as Ink } from './core/ink.js'

// ============================================================
// Core types
// ============================================================
export type { DOMElement, TextNode, ElementNames, DOMNodeAttribute } from './core/dom.js'
export type { Styles, TextStyles, Color, RGBColor, HexColor, Ansi256Color, AnsiColor } from './core/styles.js'
export type { Key } from './core/events/input-event.js'
export type { FlickerReason, FrameEvent } from './core/frame.js'
export type { MatchPosition } from './core/render-to-screen.js'
export type { SelectionState, FocusMove } from './core/selection.js'
export type { Progress } from './core/terminal.js'

// ============================================================
// Core modules
// ============================================================
export { ClickEvent } from './core/events/click-event.js'
export { EventEmitter } from './core/events/emitter.js'
export { Event } from './core/events/event.js'
export { InputEvent } from './core/events/input-event.js'
export { TerminalFocusEvent, type TerminalFocusEventType } from './core/events/terminal-focus-event.js'
export { KeyboardEvent } from './core/events/keyboard-event.js'
export { FocusEvent } from './core/events/focus-event.js'
export { FocusManager } from './core/focus.js'
export { Ansi } from './core/Ansi.js'
export { stringWidth } from './core/stringWidth.js'
export { default as wrapText } from './core/wrap-text.js'
export { default as measureElement } from './core/measure-element.js'
export { supportsTabStatus } from './core/termio/osc.js'
export { setClipboard, getClipboardPath, CLEAR_ITERM2_PROGRESS, CLEAR_TAB_STATUS, CLEAR_TERMINAL_TITLE, wrapForMultiplexer } from './core/termio/osc.js'
export { DISABLE_KITTY_KEYBOARD, DISABLE_MODIFY_OTHER_KEYS } from './core/termio/csi.js'
export { SHOW_CURSOR, DBP, DFE, DISABLE_MOUSE_TRACKING, EXIT_ALT_SCREEN, HIDE_CURSOR, ENTER_ALT_SCREEN, ENABLE_MOUSE_TRACKING } from './core/termio/dec.js'
export { default as instances } from './core/instances.js'
export { default as renderBorder, type BorderTextOptions } from './core/render-border.js'
export { isSynchronizedOutputSupported, isXtermJs, hasCursorUpViewportYankBug, writeDiffToTerminal } from './core/terminal.js'
export { colorize, applyColor, applyTextStyles, type ColorType } from './core/colorize.js'
export { wrapAnsi } from './core/wrapAnsi.js'
export { default as styles } from './core/styles.js'
export { clamp } from './core/layout/geometry.js'
export { getTerminalFocusState, getTerminalFocused, subscribeTerminalFocus } from './core/terminal-focus-state.js'
export { supportsHyperlinks } from './core/supports-hyperlinks.js'

// ============================================================
// Components (Layer 2)
// ============================================================
export { default as BaseBox } from './components/Box.js'
export type { Props as BaseBoxProps } from './components/Box.js'
export { default as BaseText } from './components/Text.js'
export type { Props as BaseTextProps } from './components/Text.js'
export { default as Button, type ButtonState, type Props as ButtonProps } from './components/Button.js'
export { default as Link } from './components/Link.js'
export type { Props as LinkProps } from './components/Link.js'
export { default as Newline } from './components/Newline.js'
export type { Props as NewlineProps } from './components/Newline.js'
export { default as Spacer } from './components/Spacer.js'
export { NoSelect } from './components/NoSelect.js'
export { RawAnsi } from './components/RawAnsi.js'
export { default as ScrollBox, type ScrollBoxHandle } from './components/ScrollBox.js'
export { AlternateScreen } from './components/AlternateScreen.js'

// App types
export type { Props as AppProps } from './components/AppContext.js'
export type { Props as StdinProps } from './components/StdinContext.js'
export { TerminalSizeContext, type TerminalSize } from './components/TerminalSizeContext.js'

// ============================================================
// Hooks
// ============================================================
export { default as useApp } from './hooks/use-app.js'
export { default as useInput } from './hooks/use-input.js'
export { useAnimationFrame } from './hooks/use-animation-frame.js'
export { useAnimationTimer, useInterval } from './hooks/use-interval.js'
export { useSelection, useHasSelection } from './hooks/use-selection.js'
export { default as useStdin } from './hooks/use-stdin.js'
export { useTabStatus, type TabStatusKind } from './hooks/use-tab-status.js'
export { useTerminalFocus } from './hooks/use-terminal-focus.js'
export { useTerminalTitle } from './hooks/use-terminal-title.js'
export { useTerminalViewport } from './hooks/use-terminal-viewport.js'
export { useSearchHighlight } from './hooks/use-search-highlight.js'
export { useDeclaredCursor } from './hooks/use-declared-cursor.js'
export { TerminalWriteProvider, useTerminalNotification, type TerminalNotification } from './hooks/useTerminalNotification.js'

// ============================================================
// Theme (Layer 3)
// ============================================================
export {
  ThemeProvider,
  usePreviewTheme,
  useTheme,
  useThemeSetting,
} from './theme/ThemeProvider.js'
export { default as Box } from './theme/ThemedBox.js'
export type { Props as BoxProps } from './theme/ThemedBox.js'
export { default as Text } from './theme/ThemedText.js'
export type { Props as TextProps } from './theme/ThemedText.js'
export { color } from './theme/color.js'

// Theme sub-components
export { Dialog } from './theme/Dialog.js'
export { Divider } from './theme/Divider.js'
export { FuzzyPicker } from './theme/FuzzyPicker.js'
export { ListItem } from './theme/ListItem.js'
export { LoadingState } from './theme/LoadingState.js'
export { Pane } from './theme/Pane.js'
export { ProgressBar } from './theme/ProgressBar.js'
export { Ratchet } from './theme/Ratchet.js'
export { StatusIcon } from './theme/StatusIcon.js'
export { Tabs } from './theme/Tabs.js'
export { Byline } from './theme/Byline.js'
export { KeyboardShortcutHint } from './theme/KeyboardShortcutHint.js'
