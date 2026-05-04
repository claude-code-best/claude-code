import { feature } from 'bun:bundle';
import chalk from 'chalk';
import * as path from 'path';
import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useNotifications } from 'src/context/notifications.js';
import { useCommandQueue } from 'src/hooks/useCommandQueue.js';
import { type IDEAtMentioned, useIdeAtMentioned } from 'src/hooks/useIdeAtMentioned.js';
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js';
import { type AppState, useAppState, useAppStateStore, useSetAppState } from 'src/state/AppState.js';
import type { FooterItem } from 'src/state/AppStateStore.js';
import { getCwd } from 'src/utils/cwd.js';
import { isQueuedCommandEditable, popAllEditable } from 'src/utils/messageQueueManager.js';
import stripAnsi from 'strip-ansi';
import { companionReservedColumns } from '../../buddy/CompanionSprite.js';
import { findBuddyTriggerPositions, useBuddyNotification } from '../../buddy/useBuddyNotification.js';
import { FastModePicker } from '../../commands/fast/fast.js';
import { isUltrareviewEnabled } from '../../commands/review/ultrareviewEnabled.js';
import { getNativeCSIuTerminalDisplayName } from '../../commands/terminalSetup/terminalSetup.js';
import { type Command, hasCommand } from '../../commands.js';
import { useIsModalOverlayActive } from '../../context/overlayContext.js';
import { useSetPromptOverlayDialog } from '../../context/promptOverlayContext.js';
import { formatImageRef, formatPastedTextRef, getPastedTextRefNumLines, parseReferences } from '../../history.js';
import type { VerificationStatus } from '../../hooks/useApiKeyVerification.js';
import { type HistoryMode, useArrowKeyHistory } from '../../hooks/useArrowKeyHistory.js';
import { useDoublePress } from '../../hooks/useDoublePress.js';
import { useHistorySearch } from '../../hooks/useHistorySearch.js';
import type { IDESelection } from '../../hooks/useIdeSelection.js';
import { useInputBuffer } from '../../hooks/useInputBuffer.js';
import { useMainLoopModel } from '../../hooks/useMainLoopModel.js';
import { usePromptSuggestion } from '../../hooks/usePromptSuggestion.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { useTypeahead } from '../../hooks/useTypeahead.js';
import { Box, type BorderTextOptions, type ClickEvent, type Key, stringWidth, Text, useInput } from '@anthropic/ink';
import { useOptionalKeybindingContext } from '../../keybindings/KeybindingContext.js';
import { getShortcutDisplay } from '../../keybindings/shortcutFormat.js';
import { useKeybinding, useKeybindings } from '../../keybindings/useKeybinding.js';
import type { MCPServerConnection } from '../../services/mcp/types.js';
import { abortPromptSuggestion, logSuggestionSuppressed } from '../../services/PromptSuggestion/promptSuggestion.js';
import { type ActiveSpeculationState, abortSpeculation } from '../../services/PromptSuggestion/speculation.js';
import { getActiveAgentForInput, getViewedTeammateTask } from '../../state/selectors.js';
import { enterTeammateView, exitTeammateView, stopOrDismissAgent } from '../../state/teammateViewHelpers.js';
import type { ToolPermissionContext } from '../../Tool.js';
import { getRunningTeammatesSorted } from '../../tasks/InProcessTeammateTask/InProcessTeammateTask.js';
import type { InProcessTeammateTaskState } from '../../tasks/InProcessTeammateTask/types.js';
import { isPanelAgentTask, type LocalAgentTaskState } from '../../tasks/LocalAgentTask/LocalAgentTask.js';
import { isBackgroundTask } from '../../tasks/types.js';
import {
  AGENT_COLOR_TO_THEME_COLOR,
  AGENT_COLORS,
  type AgentColorName,
} from '@claude-code-best/builtin-tools/tools/AgentTool/agentColorManager.js';
import type { AgentDefinition } from '@claude-code-best/builtin-tools/tools/AgentTool/loadAgentsDir.js';
import type { Message } from '../../types/message.js';
import type { PermissionMode } from '../../types/permissions.js';
import type { BaseTextInputProps, PromptInputMode, VimMode } from '../../types/textInputTypes.js';
import { isAgentSwarmsEnabled } from '../../utils/agentSwarmsEnabled.js';
import { count } from '../../utils/array.js';
import type { AutoUpdaterResult } from '../../utils/autoUpdater.js';
import { Cursor } from '../../utils/Cursor.js';
import { getGlobalConfig, type PastedContent, saveGlobalConfig } from '../../utils/config.js';
import { logForDebugging } from '../../utils/debug.js';
import { parseDirectMemberMessage, sendDirectMemberMessage } from '../../utils/directMemberMessage.js';
import type { EffortLevel } from '../../utils/effort.js';
import { env } from '../../utils/env.js';
import { errorMessage } from '../../utils/errors.js';
import { isBilledAsExtraUsage } from '../../utils/extraUsage.js';
import {
  getFastModeUnavailableReason,
  isFastModeAvailable,
  isFastModeCooldown,
  isFastModeEnabled,
  isFastModeSupportedByModel,
} from '../../utils/fastMode.js';
import { isFullscreenEnvEnabled } from '../../utils/fullscreen.js';
import type { PromptInputHelpers } from '../../utils/handlePromptSubmit.js';
import { getImageFromClipboard, PASTE_THRESHOLD } from '../../utils/imagePaste.js';
import type { ImageDimensions } from '../../utils/imageResizer.js';
import { cacheImagePath, storeImage } from '../../utils/imageStore.js';
import { isMacosOptionChar, MACOS_OPTION_SPECIAL_CHARS } from '../../utils/keyboardShortcuts.js';
import { logError } from '../../utils/log.js';
import { isOpus1mMergeEnabled, modelDisplayString } from '../../utils/model/model.js';
import { cyclePermissionMode, getNextPermissionMode } from '../../utils/permissions/getNextPermissionMode.js';
import { getPlatform } from '../../utils/platform.js';
import type { ProcessUserInputContext } from '../../utils/processUserInput/processUserInput.js';
import { editPromptInEditor } from '../../utils/promptEditor.js';
// hasAutoModeOptIn removed — auto mode is available to all users
import { findBtwTriggerPositions } from '../../utils/sideQuestion.js';
import { findSlashCommandPositions } from '../../utils/suggestions/commandSuggestions.js';
import {
  findSlackChannelPositions,
  getKnownChannelsVersion,
  hasSlackMcpServer,
  subscribeKnownChannels,
} from '../../utils/suggestions/slackChannelSuggestions.js';
import { isInProcessEnabled } from '../../utils/swarm/backends/registry.js';
import { syncTeammateMode } from '../../utils/swarm/teamHelpers.js';
import type { TeamSummary } from '../../utils/teamDiscovery.js';
import { getTeammateColor } from '../../utils/teammate.js';
import { isInProcessTeammate } from '../../utils/teammateContext.js';
import { writeToMailbox } from '../../utils/teammateMailbox.js';
import type { TextHighlight } from '../../utils/textHighlighting.js';
import type { Theme } from '../../utils/theme.js';
import { findThinkingTriggerPositions, getRainbowColor, isUltrathinkEnabled } from '../../utils/thinking.js';
import { findTokenBudgetPositions } from '../../utils/tokenBudget.js';
import { findUltraplanTriggerPositions, findUltrareviewTriggerPositions } from '../../utils/ultraplan/keyword.js';
// AutoModeOptInDialog removed — auto mode is available to all users
import { BridgeDialog } from '../BridgeDialog.js';
import { ConfigurableShortcutHint } from '../ConfigurableShortcutHint.js';
import { getVisibleAgentTasks, useCoordinatorTaskCount } from '../CoordinatorAgentStatus.js';
import { getEffortNotificationText } from '../EffortIndicator.js';
import { getFastIconString } from '../FastIcon.js';
import { GlobalSearchDialog } from '../GlobalSearchDialog.js';
import { HistorySearchDialog } from '../HistorySearchDialog.js';
import { ModelPicker } from '../ModelPicker.js';
import { QuickOpenDialog } from '../QuickOpenDialog.js';
import TextInput from '../TextInput.js';
import { ThinkingToggle } from '../ThinkingToggle.js';
import { BackgroundTasksDialog } from '../tasks/BackgroundTasksDialog.js';
import { shouldHideTasksFooter } from '../tasks/taskStatusUtils.js';
import { TeamsDialog } from '../teams/TeamsDialog.js';
import VimTextInput from '../VimTextInput.js';
import { getModeFromInput, getValueFromInput } from './inputModes.js';
import { FOOTER_TEMPORARY_STATUS_TIMEOUT, Notifications } from './Notifications.js';
import PromptInputFooter from './PromptInputFooter.js';
import type { SuggestionItem } from './PromptInputFooterSuggestions.js';
import { PromptInputModeIndicator } from './PromptInputModeIndicator.js';
import { PromptInputQueuedCommands } from './PromptInputQueuedCommands.js';
import { PromptInputStashNotice } from './PromptInputStashNotice.js';
import { useMaybeTruncateInput } from './useMaybeTruncateInput.js';
import { usePromptInputPlaceholder } from './usePromptInputPlaceholder.js';
import { useShowFastIconHint } from './useShowFastIconHint.js';
import { useSwarmBanner } from './useSwarmBanner.js';
import { isNonSpacePrintable, isVimModeEnabled } from './utils.js';

type Props = {
  debug: boolean;
  ideSelection: IDESelection | undefined;
  toolPermissionContext: ToolPermissionContext;
  setToolPermissionContext: (ctx: ToolPermissionContext) => void;
  apiKeyStatus: VerificationStatus;
  commands: Command[];
  agents: AgentDefinition[];
  isLoading: boolean;
  verbose: boolean;
  messages: Message[];
  onAutoUpdaterResult: (result: AutoUpdaterResult) => void;
  autoUpdaterResult: AutoUpdaterResult | null;
  input: string;
  onInputChange: (value: string) => void;
  mode: PromptInputMode;
  onModeChange: (mode: PromptInputMode) => void;
  stashedPrompt:
    | {
        text: string;
        cursorOffset: number;
        pastedContents: Record<number, PastedContent>;
      }
    | undefined;
  setStashedPrompt: (
    value:
      | {
          text: string;
          cursorOffset: number;
          pastedContents: Record<number, PastedContent>;
        }
      | undefined,
  ) => void;
  submitCount: number;
  onShowMessageSelector: () => void;
  /** Fullscreen message actions: shift+↑ enters cursor. */
  onMessageActionsEnter?: () => void;
  mcpClients: MCPServerConnection[];
  pastedContents: Record<number, PastedContent>;
  setPastedContents: React.Dispatch<React.SetStateAction<Record<number, PastedContent>>>;
  vimMode: VimMode;
  setVimMode: (mode: VimMode) => void;
  showBashesDialog: string | boolean;
  setShowBashesDialog: (show: string | boolean) => void;
  onExit: () => void;
  getToolUseContext: (
    messages: Message[],
    newMessages: Message[],
    abortController: AbortController,
    mainLoopModel: string,
  ) => ProcessUserInputContext;
  onSubmit: (
    input: string,
    helpers: PromptInputHelpers,
    speculationAccept?: {
      state: ActiveSpeculationState;
      speculationSessionTimeSavedMs: number;
      setAppState: (f: (prev: AppState) => AppState) => void;
    },
    options?: { fromKeybinding?: boolean },
  ) => Promise<void>;
  onAgentSubmit?: (
    input: string,
    task: InProcessTeammateTaskState | LocalAgentTaskState,
    helpers: PromptInputHelpers,
  ) => Promise<void>;
  isSearchingHistory: boolean;
  setIsSearchingHistory: (isSearching: boolean) => void;
  onDismissSideQuestion?: () => void;
  isSideQuestionVisible?: boolean;
  helpOpen: boolean;
  setHelpOpen: React.Dispatch<React.SetStateAction<boolean>>;
  hasSuppressedDialogs?: boolean;
  isLocalJSXCommandActive?: boolean;
  insertTextRef?: React.MutableRefObject<{
    insert: (text: string) => void;
    setInputWithCursor: (value: string, cursor: number) => void;
    cursorOffset: number;
  } | null>;
  voiceInterimRange?: { start: number; end: number } | null;
};

// Bottom slot has maxHeight="50%"; reserve lines for footer, border, status.
const PROMPT_FOOTER_LINES = 5;
const MIN_INPUT_VIEWPORT_LINES = 3;

function PromptInput({
  debug,
  ideSelection,
  toolPermissionContext,
  setToolPermissionContext,
  apiKeyStatus,
  commands,
  agents,
  isLoading,
  verbose,
  messages,
  onAutoUpdaterResult,
  autoUpdaterResult,
  input,
  onInputChange,
  mode,
  onModeChange,
  stashedPrompt,
  setStashedPrompt,
  submitCount,
  onShowMessageSelector,
  onMessageActionsEnter,
  mcpClients,
  pastedContents,
  setPastedContents,
  vimMode,
  setVimMode,
  showBashesDialog,
  setShowBashesDialog,
  onExit,
  getToolUseContext,
  onSubmit: onSubmitProp,
  onAgentSubmit,
  isSearchingHistory,
  setIsSearchingHistory,
  onDismissSideQuestion,
  isSideQuestionVisible,
  helpOpen,
  setHelpOpen,
  hasSuppressedDialogs,
  isLocalJSXCommandActive = false,
  insertTextRef,
  voiceInterimRange,
}: Props): React.ReactNode {
  const mainLoopModel = useMainLoopModel();
  // A local-jsx command (e.g., /mcp while agent is running) renders a full-
  // screen dialog on top of PromptInput via the immediate-command path with
  // shouldHidePromptInput: false. Those dialogs don't register in the overlay
  // system, so treat them as a modal overlay here to stop navigation keys from
  // leaking into TextInput/footer handlers and stacking a second dialog.
  const isModalOverlayActive = useIsModalOverlayActive() || isLocalJSXCommandActive;
  const [isAutoUpdating, setIsAutoUpdating] = useState(false);
  const [exitMessage, setExitMessage] = useState<{
    show: boolean;
    key?: string;
  }>({ show: false });
  const [cursorOffset, setCursorOffset] = useState<number>(input.length);
  // Track the last input value set via internal handlers so we can detect
  // external input changes (e.g. speech-to-text injection) and move cursor to end.
  const lastInternalInputRef = React.useRef(input);
  if (input !== lastInternalInputRef.current) {
    // Input changed externally (not through any internal handler) — move cursor to end
    setCursorOffset(input.length);
    lastInternalInputRef.current = input;
  }
  // 暴露一个 insertText 函数，以便调用者（例如 STT）可以在
  const trackAndSetInput = React.useCallback(
    (value: string) => {
      lastInternalInputRef.current = value;
      onInputChange(value);
    },
    [onInputChange],
  );
  // Expose an insertText function so callers (e.g. STT) can splice text at the
  // current cursor position instead of replacing the entire input.
  if (insertTextRef) {
    insertTextRef.current = {
      cursorOffset,
      insert: (text: string) => {
        const needsSpace = cursorOffset === input.length && input.length > 0 && !/\s$/.test(input);
        const insertText = needsSpace ? ' ' + text : text;
        const newValue = input.slice(0, cursorOffset) + insertText + input.slice(cursorOffset);
        lastInternalInputRef.current = newValue;
        onInputChange(newValue);
        setCursorOffset(cursorOffset + insertText.length);
      },
      setInputWithCursor: (value: string, cursor: number) => {
        lastInternalInputRef.current = value;
        onInputChange(value);
        setCursorOffset(cursor);
      },
    };
  }
  const store = useAppStateStore();
  const setAppState = useSetAppState();
  const tasks = useAppState(s => s.tasks);
  const replBridgeConnected = useAppState(s => s.replBridgeConnected);
  const replBridgeExplicit = useAppState(s => s.replBridgeExplicit);
  const replBridgeReconnecting = useAppState(s => s.replBridgeReconnecting);
  // Must match BridgeStatusIndicator's render condition (PromptInputFooter.tsx) —
  // the pill returns null for implicit-and-not-reconnecting, so nav must too,
  // otherwise bridge becomes an invisible selection stop.
  const bridgeFooterVisible = replBridgeConnected && (replBridgeExplicit || replBridgeReconnecting);
  // Tmux pill (ant-only) — visible when there's an active tungsten session
  const hasTungstenSession = useAppState(s => process.env.USER_TYPE === 'ant' && s.tungstenActiveSession !== undefined);
  const tmuxFooterVisible = process.env.USER_TYPE === 'ant' && hasTungstenSession;
  // WebBrowser pill — visible when a browser is open
  const bagelFooterVisible = useAppState(s => false);
  const teamContext = useAppState(s => s.teamContext);
  const queuedCommands = useCommandQueue();
  const promptSuggestionState = useAppState(s => s.promptSuggestion);
  const speculation = useAppState(s => s.speculation);
  const speculationSessionTimeSavedMs = useAppState(s => s.speculationSessionTimeSavedMs);
  const viewingAgentTaskId = useAppState(s => s.viewingAgentTaskId);
  const viewSelectionMode = useAppState(s => s.viewSelectionMode);
  const showSpinnerTree = useAppState(s => s.expandedView) === 'teammates';
  const { companion: _companion, companionMuted } = feature('BUDDY')
    ? getGlobalConfig()
    : { companion: undefined, companionMuted: undefined };
  const companionFooterVisible = !!_companion && !companionMuted;
  // Brief mode: BriefSpinner/BriefIdleStatus own the 2-row footprint above
  // the input. Dropping marginTop here lets the spinner sit flush against
  // the input bar. viewingAgentTaskId mirrors the gate on both (Spinner.tsx,
  // REPL.tsx) — teammate view falls back to SpinnerWithVerbInner which has
  // its own marginTop, so the gap stays even without ours.
  const briefOwnsGap =
    feature('KAIROS') || feature('KAIROS_BRIEF') ? useAppState(s => s.isBriefOnly) && !viewingAgentTaskId : false;
  const mainLoopModel_ = useAppState(s => s.mainLoopModel);
  const mainLoopModelForSession = useAppState(s => s.mainLoopModelForSession);
  const thinkingEnabled = useAppState(s => s.thinkingEnabled);
  const isFastMode = useAppState(s => (isFastModeEnabled() ? s.fastMode : false));
  const effortValue = useAppState(s => s.effortValue);
  const viewedTeammate = getViewedTeammateTask(store.getState());
  const viewingAgentName = viewedTeammate?.identity.agentName;
  // identity.color is typed as `string | undefined` (not AgentColorName) because
  // teammate identity comes from file-based config. Validate before casting to
  // ensure we only use valid color names (falls back to cyan if invalid).
  const viewingAgentColor =
    viewedTeammate?.identity.color && AGENT_COLORS.includes(viewedTeammate.identity.color as AgentColorName)
      ? (viewedTeammate.identity.color as AgentColorName)
      : undefined;
  // In-process teammates sorted alphabetically for footer team selector
  const inProcessTeammates = useMemo(() => getRunningTeammatesSorted(tasks), [tasks]);

  // Team mode: all background tasks are in-process teammates
  const isTeammateMode = inProcessTeammates.length > 0 || viewedTeammate !== undefined;

  // 查看队友时，在页脚显示其权限模式而非队长的
  const effectiveToolPermissionContext = useMemo((): ToolPermissionContext => {
    if (viewedTeammate) {
      return {
        ...toolPermissionContext,
        mode: viewedTeammate.permissionMode,
      };
    }
    return toolPermissionContext;
  }, [viewedTeammate, toolPermissionContext]);
  const { historyQuery, setHistoryQuery, historyMatch, historyFailedMatch } = useHistorySearch(
    entry => {
      setPastedContents(entry.pastedContents);
      void onSubmit(entry.display);
    },
    input,
    trackAndSetInput,
    setCursorOffset,
    cursorOffset,
    onModeChange,
    mode,
    isSearchingHistory,
    setIsSearchingHistory,
    setPastedContents,
    pastedContents,
  );
  // Counter for paste IDs (shared between images and text).
  // Compute initial value once from existing messages (for --continue/--resume).
  // useRef(fn()) evaluates fn() on every render and discards the result after
  // mount — getInitialPasteId walks all messages + regex-scans text blocks,
  // so guard with a lazy-init pattern to run it exactly once.
  const nextPasteIdRef = useRef(-1);
  if (nextPasteIdRef.current === -1) {
    nextPasteIdRef.current = getInitialPasteId(messages);
  }
  // Armed by onImagePaste; if the very next keystroke is a non-space
  // printable, inputFilter prepends a space before it. Any other input
  // (arrow, escape, backspace, paste, space) disarms without inserting.
  const pendingSpaceAfterPillRef = useRef(false);

  const [showTeamsDialog, setShowTeamsDialog] = useState(false);
  const [showBridgeDialog, setShowBridgeDialog] = useState(false);
  const [teammateFooterIndex, setTeammateFooterIndex] = useState(0);
  // -1 sentinel: tasks pill is selected but no specific agent row is selected yet.
  // First ↓ selects the pill, second ↓ moves to row 0. Prevents double-select
  // of pill + row when both bg tasks (pill) and forked agents (rows) are visible.
  const coordinatorTaskIndex = useAppState(s => s.coordinatorTaskIndex);
  const setCoordinatorTaskIndex = useCallback(
    (v: number | ((prev: number) => number)) =>
      setAppState(prev => {
        const next = typeof v === 'function' ? v(prev.coordinatorTaskIndex) : v;
        if (next === prev.coordinatorTaskIndex) return prev;
        return { ...prev, coordinatorTaskIndex: next };
      }),
    [setAppState],
  );
  const coordinatorTaskCount = useCoordinatorTaskCount();
  // The pill (BackgroundTaskStatus) only renders when non-local_agent bg tasks
  // exist. When only local_agent tasks are running (coordinator/fork mode), the
  // pill is absent, so the -1 sentinel would leave nothing visually selected.
  // In that case, skip -1 and treat 0 as the minimum selectable index.
  const hasBgTaskPill = useMemo(
    () =>
      Object.values(tasks).some(t => isBackgroundTask(t) && !(process.env.USER_TYPE === 'ant' && isPanelAgentTask(t))),
    [tasks],
  );
  const minCoordinatorIndex = hasBgTaskPill ? -1 : 0;
  // Clamp index when tasks complete and the list shrinks beneath the cursor
  useEffect(() => {
    if (coordinatorTaskIndex >= coordinatorTaskCount) {
      setCoordinatorTaskIndex(Math.max(minCoordinatorIndex, coordinatorTaskCount - 1));
    } else if (coordinatorTaskIndex < minCoordinatorIndex) {
      setCoordinatorTaskIndex(minCoordinatorIndex);
    }
  }, [coordinatorTaskCount, coordinatorTaskIndex, minCoordinatorIndex]);
  const [isPasting, setIsPasting] = useState(false);
  const [isExternalEditorActive, setIsExternalEditorActive] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showQuickOpen, setShowQuickOpen] = useState(false);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [showHistoryPicker, setShowHistoryPicker] = useState(false);
  const [showFastModePicker, setShowFastModePicker] = useState(false);
  const [showThinkingToggle, setShowThinkingToggle] = useState(false);

  // 检查光标是否在输入框的第一行
  const isCursorOnFirstLine = useMemo(() => {
    const firstNewlineIndex = input.indexOf('\n');
    if (firstNewlineIndex === -1) {
      return true; // No newlines, cursor is always on first line
    }
    return cursorOffset <= firstNewlineIndex;
  }, [input, cursorOffset]);

  const isCursorOnLastLine = useMemo(() => {
    const lastNewlineIndex = input.lastIndexOf('\n');
    if (lastNewlineIndex === -1) {
      return true; // No newlines, cursor is always on last line
    }
    return cursorOffset > lastNewlineIndex;
  }, [input, cursorOffset]);

  // 从 teamContext 派生团队信息（无需文件系统 I/O）
  // 一个会话一次只能领导一个团队
  const cachedTeams: TeamSummary[] = useMemo(() => {
    if (!isAgentSwarmsEnabled()) return [];
    // In-process mode uses Shift+Down/Up navigation instead of footer menu
    if (isInProcessEnabled()) return [];
    if (!teamContext) {
      return [];
    }
    const teammateCount = count(Object.values(teamContext.teammates), t => t.name !== 'team-lead');
    return [
      {
        name: teamContext.teamName,
        memberCount: teammateCount,
        runningCount: 0,
        idleCount: 0,
      },
    ];
  }, [teamContext]);

  // ─── Footer pill navigation ─────────────────────────────────────────────
  // Which pills render below the input box. Order here IS the nav order
  // (down/right = forward, up/left = back). Selection lives in AppState so
  // pills rendered outside PromptInput (CompanionSprite) can read focus.
  const runningTaskCount = useMemo(() => count(Object.values(tasks), t => t.status === 'running'), [tasks]);
  // Panel shows retained-completed agents too (getVisibleAgentTasks), so the
  // pill must stay navigable whenever the panel has rows — not just when
  // something is running.
  const tasksFooterVisible =
    (runningTaskCount > 0 || (process.env.USER_TYPE === 'ant' && coordinatorTaskCount > 0)) &&
    !shouldHideTasksFooter(tasks, showSpinnerTree);
  const teamsFooterVisible = cachedTeams.length > 0;

  const footerItems = useMemo(
    () =>
      [
        tasksFooterVisible && 'tasks',
        tmuxFooterVisible && 'tmux',
        bagelFooterVisible && 'bagel',
        teamsFooterVisible && 'teams',
        bridgeFooterVisible && 'bridge',
        companionFooterVisible && 'companion',
      ].filter(Boolean) as FooterItem[],
    [
      tasksFooterVisible,
      tmuxFooterVisible,
      bagelFooterVisible,
      teamsFooterVisible,
      bridgeFooterVisible,
      companionFooterVisible,
    ],
  );

  // Effective selection: null if the selected pill stopped rendering (bridge
  // disconnected, task finished). The derivation makes the UI correct
  // immediately; the useEffect below clears the raw state so it doesn't
  // resurrect when the same pill reappears (new task starts → focus stolen).
  const rawFooterSelection = useAppState(s => s.footerSelection);
  const footerItemSelected = rawFooterSelection && footerItems.includes(rawFooterSelection) ? rawFooterSelection : null;

  useEffect(() => {
    if (rawFooterSelection && !footerItemSelected) {
      setAppState(prev => (prev.footerSelection === null ? prev : { ...prev, footerSelection: null }));
    }
  }, [rawFooterSelection, footerItemSelected, setAppState]);

  const tasksSelected = footerItemSelected === 'tasks';
  const tmuxSelected = footerItemSelected === 'tmux';
  const bagelSelected = footerItemSelected === 'bagel';
  const teamsSelected = footerItemSelected === 'teams';
  const bridgeSelected = footerItemSelected === 'bridge';

  function selectFooterItem(item: FooterItem | null): void {
    setAppState(prev => (prev.footerSelection === item ? prev : { ...prev, footerSelection: item }));
    if (item === 'tasks') {
      setTeammateFooterIndex(0);
      setCoordinatorTaskIndex(minCoordinatorIndex);
    }
  }

  // delta: +1 = 向下/向右，-1 = 向上/向左。如果导航发生（包括在起始处取消选择）则返回 true
  // 如果到达边界则返回 false。
  function navigateFooter(delta: 1 | -1, exitAtStart = false): boolean {
    const idx = footerItemSelected ? footerItems.indexOf(footerItemSelected) : -1;
    const next = footerItems[idx + delta];
    if (next) {
      selectFooterItem(next);
      return true;
    }
    if (delta < 0 && exitAtStart) {
      selectFooterItem(null);
      return true;
    }
    return false;
  }

  // 提示建议钩子 - 读取查询循环中由分叉代理生成的建议
  const {
    suggestion: promptSuggestion,
    markAccepted,
    logOutcomeAtSubmission,
    markShown,
  } = usePromptSuggestion({
    inputValue: input,
    isAssistantResponding: isLoading,
  });

  const displayedValue = useMemo(
    () =>
      isSearchingHistory && historyMatch
        ? getValueFromInput(typeof historyMatch === 'string' ? historyMatch : historyMatch.display)
        : input,
    [isSearchingHistory, historyMatch, input],
  );

  const thinkTriggers = useMemo(() => findThinkingTriggerPositions(displayedValue), [displayedValue]);

  const ultraplanSessionUrl = useAppState(s => s.ultraplanSessionUrl);
  const ultraplanLaunching = useAppState(s => s.ultraplanLaunching);
  const ultraplanTriggers = useMemo(
    () =>
      feature('ULTRAPLAN') && !ultraplanSessionUrl && !ultraplanLaunching
        ? findUltraplanTriggerPositions(displayedValue)
        : [],
    [displayedValue, ultraplanSessionUrl, ultraplanLaunching],
  );

  const ultrareviewTriggers = useMemo(
    () => (isUltrareviewEnabled() ? findUltrareviewTriggerPositions(displayedValue) : []),
    [displayedValue],
  );

  const btwTriggers = useMemo(() => findBtwTriggerPositions(displayedValue), [displayedValue]);

  const buddyTriggers = useMemo(() => findBuddyTriggerPositions(displayedValue), [displayedValue]);

  const slashCommandTriggers = useMemo(() => {
    const positions = findSlashCommandPositions(displayedValue);
    // Only highlight valid commands
    return positions.filter(pos => {
      const commandName = displayedValue.slice(pos.start + 1, pos.end); // +1 to skip "/"
      return hasCommand(commandName, commands);
    });
  }, [displayedValue, commands]);

  const tokenBudgetTriggers = useMemo(
    () => (feature('TOKEN_BUDGET') ? findTokenBudgetPositions(displayedValue) : []),
    [displayedValue],
  );

  const knownChannelsVersion = useSyncExternalStore(subscribeKnownChannels, getKnownChannelsVersion);
  const slackChannelTriggers = useMemo(
    () => (hasSlackMcpServer(store.getState().mcp.clients) ? findSlackChannelPositions(displayedValue) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- store is a stable ref
    [displayedValue, knownChannelsVersion],
  );

  // 查找 @name 提及并使用团队成员的颜色高亮显示
  const memberMentionHighlights = useMemo((): Array<{
    start: number;
    end: number;
    themeColor: keyof Theme;
  }> => {
    if (!isAgentSwarmsEnabled()) return [];
    if (!teamContext?.teammates) return [];

    const highlights: Array<{
      start: number;
      end: number;
      themeColor: keyof Theme;
    }> = [];
    const members = teamContext.teammates;
    if (!members) return highlights;

    // Find all @name patterns in the input
    const regex = /(^|\s)@([\w-]+)/g;
    const memberValues = Object.values(members);
    let match;
    while ((match = regex.exec(displayedValue)) !== null) {
      const leadingSpace = match[1] ?? '';
      const nameStart = match.index + leadingSpace.length;
      const fullMatch = match[0].trimStart();
      const name = match[2];

      // Check if this name matches a team member
      const member = memberValues.find(t => t.name === name);
      if (member?.color) {
        const themeColor = AGENT_COLOR_TO_THEME_COLOR[member.color as AgentColorName];
        if (themeColor) {
          highlights.push({
            start: nameStart,
            end: nameStart + fullMatch.length,
            themeColor,
          });
        }
      }
    }
    return highlights;
  }, [displayedValue, teamContext]);

  const imageRefPositions = useMemo(
    () =>
      parseReferences(displayedValue)
        .filter(r => r.match.startsWith('[Image'))
        .map(r => ({ start: r.index, end: r.index + r.match.length })),
    [displayedValue],
  );

  // chip.start is the "selected" state: the inverted chip IS the cursor.
  // chip.end stays a normal position so you can park the cursor right after
  // `]` like any other character.
  const cursorAtImageChip = imageRefPositions.some(r => r.start === cursorOffset);

  // 向上/向下移动或全屏点击可能使光标严格落在
  // 芯片内部；吸附到较近的边界，使其永远不可编辑
  // char-by-char.
  useEffect(() => {
    const inside = imageRefPositions.find(r => cursorOffset > r.start && cursorOffset < r.end);
    if (inside) {
      const mid = (inside.start + inside.end) / 2;
      setCursorOffset(cursorOffset < mid ? inside.start : inside.end);
    }
  }, [cursorOffset, imageRefPositions, setCursorOffset]);

  const combinedHighlights = useMemo((): TextHighlight[] => {
    const highlights: TextHighlight[] = [];

    // 当光标位于 chip.start（“选中”状态）时，反转 [Image #N] 芯片
    // 以便退格删除在视觉上显而易见。
    for (const ref of imageRefPositions) {
      if (cursorOffset === ref.start) {
        highlights.push({
          start: ref.start,
          end: ref.end,
          color: undefined,
          inverse: true,
          priority: 8,
        });
      }
    }

    if (isSearchingHistory && historyMatch && !historyFailedMatch) {
      highlights.push({
        start: cursorOffset,
        end: cursorOffset + historyQuery.length,
        color: 'warning',
        priority: 20,
      });
    }

    // 添加“顺便说一下”高亮（纯黄色）
    for (const trigger of btwTriggers) {
      highlights.push({
        start: trigger.start,
        end: trigger.end,
        color: 'warning',
        priority: 15,
      });
    }

    // 添加 /command 高亮（蓝色）
    for (const trigger of slashCommandTriggers) {
      highlights.push({
        start: trigger.start,
        end: trigger.end,
        color: 'suggestion',
        priority: 5,
      });
    }

    // 添加令牌预算高亮（蓝色）
    for (const trigger of tokenBudgetTriggers) {
      highlights.push({
        start: trigger.start,
        end: trigger.end,
        color: 'suggestion',
        priority: 5,
      });
    }

    for (const trigger of slackChannelTriggers) {
      highlights.push({
        start: trigger.start,
        end: trigger.end,
        color: 'suggestion',
        priority: 5,
      });
    }

    // 使用团队成员的颜色添加 @name 高亮
    for (const mention of memberMentionHighlights) {
      highlights.push({
        start: mention.start,
        end: mention.end,
        color: mention.themeColor,
        priority: 5,
      });
    }

    // 调暗临时语音听写文本
    if (voiceInterimRange) {
      highlights.push({
        start: voiceInterimRange.start,
        end: voiceInterimRange.end,
        color: undefined,
        dimColor: true,
        priority: 1,
      });
    }

    // 为 ultrathink 关键字添加彩虹高亮（逐字符循环颜色）
    if (isUltrathinkEnabled()) {
      for (const trigger of thinkTriggers) {
        for (let i = trigger.start; i < trigger.end; i++) {
          highlights.push({
            start: i,
            end: i + 1,
            color: getRainbowColor(i - trigger.start),
            shimmerColor: getRainbowColor(i - trigger.start, true),
            priority: 10,
          });
        }
      }
    }

    // 对 ultraplan 关键字应用相同的彩虹处理
    if (feature('ULTRAPLAN')) {
      for (const trigger of ultraplanTriggers) {
        for (let i = trigger.start; i < trigger.end; i++) {
          highlights.push({
            start: i,
            end: i + 1,
            color: getRainbowColor(i - trigger.start),
            shimmerColor: getRainbowColor(i - trigger.start, true),
            priority: 10,
          });
        }
      }
    }

    // 对 ultrareview 关键字应用相同的彩虹处理
    for (const trigger of ultrareviewTriggers) {
      for (let i = trigger.start; i < trigger.end; i++) {
        highlights.push({
          start: i,
          end: i + 1,
          color: getRainbowColor(i - trigger.start),
          shimmerColor: getRainbowColor(i - trigger.start, true),
          priority: 10,
        });
      }
    }

    // 为 /buddy 添加彩虹效果
    for (const trigger of buddyTriggers) {
      for (let i = trigger.start; i < trigger.end; i++) {
        highlights.push({
          start: i,
          end: i + 1,
          color: getRainbowColor(i - trigger.start),
          shimmerColor: getRainbowColor(i - trigger.start, true),
          priority: 10,
        });
      }
    }

    return highlights;
  }, [
    isSearchingHistory,
    historyQuery,
    historyMatch,
    historyFailedMatch,
    cursorOffset,
    btwTriggers,
    imageRefPositions,
    memberMentionHighlights,
    slashCommandTriggers,
    tokenBudgetTriggers,
    slackChannelTriggers,
    displayedValue,
    voiceInterimRange,
    thinkTriggers,
    ultraplanTriggers,
    ultrareviewTriggers,
    buddyTriggers,
  ]);

  const { addNotification, removeNotification } = useNotifications();

  // 显示 ultrathink 通知
  useEffect(() => {
    if (thinkTriggers.length && isUltrathinkEnabled()) {
      addNotification({
        key: 'ultrathink-active',
        text: '本轮努力程度设置为高',
        priority: 'immediate',
        timeoutMs: 5000,
      });
    } else {
      removeNotification('ultrathink-active');
    }
  }, [addNotification, removeNotification, thinkTriggers.length]);

  useEffect(() => {
    if (feature('ULTRAPLAN') && ultraplanTriggers.length) {
      addNotification({
        key: 'ultraplan-active',
        text: '此提示将在网页版 Claude Code 中启动一个 ultraplan 会话',
        priority: 'immediate',
        timeoutMs: 5000,
      });
    } else {
      removeNotification('ultraplan-active');
    }
  }, [addNotification, removeNotification, ultraplanTriggers.length]);

  useEffect(() => {
    if (isUltrareviewEnabled() && ultrareviewTriggers.length) {
      addNotification({
        key: 'ultrareview-active',
        text: 'Run /ultrareview after Claude finishes to review these changes in the cloud',
        priority: 'immediate',
        timeoutMs: 5000,
      });
    }
  }, [addNotification, ultrareviewTriggers.length]);

  // Track input length for stash hint
  const prevInputLengthRef = useRef(input.length);
  const peakInputLengthRef = useRef(input.length);

  // 当用户进行任何输入更改时，关闭暂存提示
  const dismissStashHint = useCallback(() => {
    removeNotification('stash-hint');
  }, [removeNotification]);

  // 当用户逐渐清空大量输入时，显示暂存提示
  useEffect(() => {
    const prevLength = prevInputLengthRef.current;
    const peakLength = peakInputLengthRef.current;
    const currentLength = input.length;
    prevInputLengthRef.current = currentLength;

    // 输入增长时更新峰值
    if (currentLength > peakLength) {
      peakInputLengthRef.current = currentLength;
      return;
    }

    // 输入为空时重置状态
    if (currentLength === 0) {
      peakInputLengthRef.current = 0;
      return;
    }

    // Detect gradual clear: peak was high, current is low, but this wasn't a single big jump
    // (rapid clears like esc-esc go from 20+ to 0 in one step)
    const clearedSubstantialInput = peakLength >= 20 && currentLength <= 5;
    const wasRapidClear = prevLength >= 20 && currentLength <= 5;

    if (clearedSubstantialInput && !wasRapidClear) {
      const config = getGlobalConfig();
      if (!config.hasUsedStash) {
        addNotification({
          key: 'stash-hint',
          jsx: (
            <Text dimColor>
              Tip: <ConfigurableShortcutHint action="chat:stash" context="Chat" fallback="ctrl+s" description="stash" />
            </Text>
          ),
          priority: 'immediate',
          timeoutMs: FOOTER_TEMPORARY_STATUS_TIMEOUT,
        });
      }
      peakInputLengthRef.current = currentLength;
    }
  }, [input.length, addNotification]);

  // 为撤销功能初始化输入缓冲区
  const { pushToBuffer, undo, canUndo, clearBuffer } = useInputBuffer({
    maxBufferSize: 50,
    debounceMs: 1000,
  });

  useMaybeTruncateInput({
    input,
    pastedContents,
    onInputChange: trackAndSetInput,
    setCursorOffset,
    setPastedContents,
  });

  const defaultPlaceholder = usePromptInputPlaceholder({
    input,
    submitCount,
    viewingAgentName,
  });

  const onChange = useCallback(
    (value: string) => {
      if (value === '?') {
        logEvent('tengu_help_toggled', {});
        setHelpOpen(v => !v);
        return;
      }
      setHelpOpen(false);

      // Dismiss stash hint when user makes any input change
      dismissStashHint();

      // Cancel any pending prompt suggestion and speculation when user types
      abortPromptSuggestion();
      abortSpeculation(setAppState);

      // Check if this is a single character insertion at the start
      const isSingleCharInsertion = value.length === input.length + 1;
      const insertedAtStart = cursorOffset === 0;
      const mode = getModeFromInput(value);

      if (insertedAtStart && mode !== 'prompt') {
        if (isSingleCharInsertion) {
          onModeChange(mode);
          return;
        }
        // 向空输入中插入多字符（例如，通过 Tab 键接受的 "! gcloud auth login"）
        if (input.length === 0) {
          onModeChange(mode);
          const valueWithoutMode = getValueFromInput(value).replaceAll('\t', '    ');
          pushToBuffer(input, cursorOffset, pastedContents);
          trackAndSetInput(valueWithoutMode);
          setCursorOffset(valueWithoutMode.length);
          return;
        }
      }

      const processedValue = value.replaceAll('\t', '    ');

      // 在进行更改前，将当前状态推送到缓冲区
      if (input !== processedValue) {
        pushToBuffer(input, cursorOffset, pastedContents);
      }

      // Deselect footer items when user types
      setAppState(prev => (prev.footerSelection === null ? prev : { ...prev, footerSelection: null }));

      trackAndSetInput(processedValue);
    },
    [trackAndSetInput, onModeChange, input, cursorOffset, pushToBuffer, pastedContents, dismissStashHint, setAppState],
  );

  const { resetHistory, onHistoryUp, onHistoryDown, dismissSearchHint, historyIndex } = useArrowKeyHistory(
    (value: string, historyMode: HistoryMode, pastedContents: Record<number, PastedContent>) => {
      onChange(value);
      onModeChange(historyMode);
      setPastedContents(pastedContents);
    },
    input,
    pastedContents,
    setCursorOffset,
    mode,
  );

  // 用户开始搜索时，关闭搜索提示
  useEffect(() => {
    if (isSearchingHistory) {
      dismissSearchHint();
    }
  }, [isSearchingHistory, dismissSearchHint]);

  // 仅当有 0 或 1 个斜杠命令建议时，才使用历史记录导航。
  // 页脚导航不在此处——当选中一个药丸时，TextInput 的 focus=false，所以
  // 这些永远不会触发。页脚按键绑定上下文会处理 ↑/↓ 键。
  function handleHistoryUp() {
    if (suggestions.length > 1) {
      return;
    }

    // 仅当光标在第一行时，才导航历史记录。
    // 在多行输入中，上箭头应移动光标（由 TextInput 处理）
    // 并且仅在输入顶部时触发历史记录。
    if (!isCursorOnFirstLine) {
      return;
    }

    // If there's an editable queued command, move it to the input for editing when UP is pressed
    const hasEditableCommand = queuedCommands.some(isQueuedCommandEditable);
    if (hasEditableCommand) {
      void popAllCommandsFromQueue();
      return;
    }

    onHistoryUp();
  }

  function handleHistoryDown() {
    if (suggestions.length > 1) {
      return;
    }

    // 仅当光标在最后一行时，才导航历史记录/页脚。
    // 在多行输入中，下箭头应移动光标（由 TextInput 处理）
    // 并且仅在输入底部时触发导航。
    if (!isCursorOnLastLine) {
      return;
    }

    // 在历史记录底部 → 进入第一个可见药丸的页脚
    if (onHistoryDown() && footerItems.length > 0) {
      const first = footerItems[0]!;
      selectFooterItem(first);
      if (first === 'tasks' && !getGlobalConfig().hasSeenTasksHint) {
        saveGlobalConfig(c => (c.hasSeenTasksHint ? c : { ...c, hasSeenTasksHint: true }));
      }
    }
  }

  // 直接创建建议状态——稍后我们将通过 useTypeahead 同步它
  const [suggestionsState, setSuggestionsStateRaw] = useState<{
    suggestions: SuggestionItem[];
    selectedSuggestion: number;
    commandArgumentHint?: string;
  }>({
    suggestions: [],
    selectedSuggestion: -1,
    commandArgumentHint: undefined,
  });

  // 建议状态的设置器
  const setSuggestionsState = useCallback(
    (updater: typeof suggestionsState | ((prev: typeof suggestionsState) => typeof suggestionsState)) => {
      setSuggestionsStateRaw(prev => (typeof updater === 'function' ? updater(prev) : updater));
    },
    [],
  );

  const onSubmit = useCallback(
    async (inputParam: string, isSubmittingSlashCommand = false) => {
      inputParam = inputParam.trimEnd();

      // Don't submit if a footer indicator is being opened. Read fresh from
      // store — footer:openSelected calls selectFooterItem(null) then onSubmit
      // in the same tick, and the closure value hasn't updated yet. Apply the
      // same "still visible?" derivation as footerItemSelected so a stale
      // selection (pill disappeared) doesn't swallow Enter.
      const state = store.getState();
      if (state.footerSelection && footerItems.includes(state.footerSelection)) {
        return;
      }

      // 在选择模式下，Enter 键确认选择（useBackgroundTaskNavigation）。
      // BaseTextInput 的 useInput 在该钩子之前注册（子级 effect 先触发），
      // 因此没有此防护，Enter 键会触发两次并自动提交建议。
      if (state.viewSelectionMode === 'selecting-agent') {
        return;
      }

      // Check for images early - we need this for suggestion logic below
      const hasImages = Object.values(pastedContents).some(c => c.type === 'image');

      // If input is empty OR matches the suggestion, submit it
      // But if there are images attached, don't auto-accept the suggestion -
      // the user wants to submit just the image(s).
      // Only in leader view — promptSuggestion is leader-context, not teammate.
      const suggestionText = promptSuggestionState.text;
      const inputMatchesSuggestion = inputParam.trim() === '' || inputParam === suggestionText;
      if (inputMatchesSuggestion && suggestionText && !hasImages && !state.viewingAgentTaskId) {
        // If speculation is active, inject messages immediately as they stream
        if (speculation.status === 'active') {
          markAccepted();
          // skipReset: resetSuggestion would abort the speculation before we accept it
          logOutcomeAtSubmission(suggestionText, { skipReset: true });

          void onSubmitProp(
            suggestionText,
            {
              setCursorOffset,
              clearBuffer,
              resetHistory,
            },
            {
              state: speculation,
              speculationSessionTimeSavedMs: speculationSessionTimeSavedMs,
              setAppState,
            },
          );
          return; // Skip normal query - speculation handled it
        }

        // 常规建议接受（要求 shownAt > 0）
        if (promptSuggestionState.shownAt > 0) {
          markAccepted();
          inputParam = suggestionText;
        }
      }

      // 处理 @name 直接消息
      if (isAgentSwarmsEnabled()) {
        const directMessage = parseDirectMemberMessage(inputParam);
        if (directMessage) {
          const result = await sendDirectMemberMessage(
            directMessage.recipientName,
            directMessage.message,
            teamContext,
            writeToMailbox,
          );

          if (result.success) {
            addNotification({
              key: 'direct-message-sent',
              text: `发送给 @${result.recipientName}`,
              priority: 'immediate',
              timeoutMs: 3000,
            });
            trackAndSetInput('');
            setCursorOffset(0);
            clearBuffer();
            resetHistory();
            return;
          } else if (!result.success && (result as { error: string }).error === 'no_team_context') {
            // 无团队上下文 - 回退至正常提示提交
          } else {
            // 未知收件人 - 回退至正常提示提交
            // 这允许例如 "@utils explain this code" 作为提示发送
          }
        }
      }

      // 如果附加了图像，即使没有文本也允许提交
      if (inputParam.trim() === '' && !hasImages) {
        return;
      }

      // PromptInput UX: 检查建议下拉列表是否正在显示
      // 对于目录建议，允许提交（Tab 键用于补全）
      const hasDirectorySuggestions =
        suggestionsState.suggestions.length > 0 &&
        suggestionsState.suggestions.every(s => s.description === 'directory');

      if (suggestionsState.suggestions.length > 0 && !isSubmittingSlashCommand && !hasDirectorySuggestions) {
        logForDebugging(`[onSubmit] early return: suggestions showing (count=${suggestionsState.suggestions.length})`);
        return; // Don't submit, user needs to clear suggestions first
      }

      // 如果存在建议，记录建议结果
      if (promptSuggestionState.text && promptSuggestionState.shownAt > 0) {
        logOutcomeAtSubmission(inputParam);
      }

      // Clear stash hint notification on submit
      removeNotification('stash-hint');

      // Route input to viewed agent (in-process teammate or named local_agent).
      const activeAgent = getActiveAgentForInput(store.getState());
      if (activeAgent.type !== 'leader' && onAgentSubmit) {
        logEvent('tengu_transcript_input_to_teammate', {});
        await onAgentSubmit(inputParam, activeAgent.task, {
          setCursorOffset,
          clearBuffer,
          resetHistory,
        });
        return;
      }

      // 正常领导者提交
      await onSubmitProp(inputParam, {
        setCursorOffset,
        clearBuffer,
        resetHistory,
      });
    },
    [
      promptSuggestionState,
      speculation,
      speculationSessionTimeSavedMs,
      teamContext,
      store,
      footerItems,
      suggestionsState.suggestions,
      onSubmitProp,
      onAgentSubmit,
      clearBuffer,
      resetHistory,
      logOutcomeAtSubmission,
      setAppState,
      markAccepted,
      pastedContents,
      removeNotification,
    ],
  );

  const { suggestions, selectedSuggestion, commandArgumentHint, inlineGhostText, maxColumnWidth } = useTypeahead({
    commands,
    onInputChange: trackAndSetInput,
    onSubmit,
    setCursorOffset,
    input,
    cursorOffset,
    mode,
    agents,
    setSuggestionsState,
    suggestionsState,
    suppressSuggestions: isSearchingHistory || historyIndex > 0,
    markAccepted,
    onModeChange,
  });

  // Track if prompt suggestion should be shown (computed later with terminal width).
  // Hidden in teammate view — suggestion is leader-context only.
  const showPromptSuggestion = mode === 'prompt' && suggestions.length === 0 && promptSuggestion && !viewingAgentTaskId;
  if (showPromptSuggestion) {
    markShown();
  }

  // If suggestion was generated but can't be shown due to timing, log suppression.
  // Exclude teammate view: markShown() is gated above, so shownAt stays 0 there —
  // but that's not a timing failure, the suggestion is valid when returning to leader.
  if (promptSuggestionState.text && !promptSuggestion && promptSuggestionState.shownAt === 0 && !viewingAgentTaskId) {
    logSuggestionSuppressed('timing', promptSuggestionState.text);
    setAppState(prev => ({
      ...prev,
      promptSuggestion: {
        text: null,
        promptId: null,
        shownAt: 0,
        acceptedAt: 0,
        generationRequestId: null,
      },
    }));
  }

  function onImagePaste(
    image: string,
    mediaType?: string,
    filename?: string,
    dimensions?: ImageDimensions,
    sourcePath?: string,
  ) {
    logEvent('tengu_paste_image', {});
    onModeChange('prompt');

    const pasteId = nextPasteIdRef.current++;

    const newContent: PastedContent = {
      id: pasteId,
      type: 'image',
      content: image,
      mediaType: mediaType || 'image/png', // default to PNG if not provided
      filename: filename || '粘贴的图片',
      dimensions,
      sourcePath,
    };

    // Cache path immediately (fast) so links work on render
    cacheImagePath(newContent);

    // Store image to disk in background
    void storeImage(newContent);

    // Update UI
    setPastedContents(prev => ({ ...prev, [pasteId]: newContent }));
    // Multi-image paste calls onImagePaste in a loop. If the ref is already
    // armed, the previous pill's lazy space fires now (before this pill)
    // rather than being lost.
    const prefix = pendingSpaceAfterPillRef.current ? ' ' : '';
    insertTextAtCursor(prefix + formatImageRef(pasteId));
    pendingSpaceAfterPillRef.current = true;
  }

  // 修剪那些 [Image #N] 占位符已不在输入文本中的图像。
  // 涵盖药丸退格键、Ctrl+U、逐字符删除 — 任何删
  // 除 引用的编辑。onImagePaste 在同一事件中批量处理 setPastedContents + insertTextAtCursor，
  // 因此此效果会看到占位符已存在。
  useEffect(() => {
    const referencedIds = new Set(parseReferences(input).map(r => r.id));
    setPastedContents(prev => {
      const orphaned = Object.values(prev).filter(c => c.type === 'image' && !referencedIds.has(c.id));
      if (orphaned.length === 0) return prev;
      const next = { ...prev };
      for (const img of orphaned) delete next[img.id];
      return next;
    });
  }, [input, setPastedContents]);

  function onTextPaste(rawText: string) {
    pendingSpaceAfterPillRef.current = false;
    // Clean up pasted text - strip ANSI escape codes and normalize line endings and tabs
    let text = stripAnsi(rawText).replace(/\r/g, '\n').replaceAll('\t', '    ');

    // 匹配键入/自动建议：将 `!cmd` 粘贴到空输入中会进入 bash 模式。
    if (input.length === 0) {
      const pastedMode = getModeFromInput(text);
      if (pastedMode !== 'prompt') {
        onModeChange(pastedMode);
        text = getValueFromInput(text);
      }
    }

    const numLines = getPastedTextRefNumLines(text);
    // Limit the number of lines to show in the input
    // If the overall layout is too high then Ink will repaint
    // the entire terminal.
    // The actual required height is dependent on the content, this
    // is just an estimate.
    const maxLines = Math.min(rows - 10, 2);

    // 对长粘贴文本（>PASTE_THRESHOLD 字符）进行特殊处理
    // 或者如果它超过了我们想要显示的行数
    if (text.length > PASTE_THRESHOLD || numLines > maxLines) {
      const pasteId = nextPasteIdRef.current++;

      const newContent: PastedContent = {
        id: pasteId,
        type: 'text',
        content: text,
      };

      setPastedContents(prev => ({ ...prev, [pasteId]: newContent }));

      insertTextAtCursor(formatPastedTextRef(pasteId, numLines));
    } else {
      // For shorter pastes, just insert the text normally
      insertTextAtCursor(text);
    }
  }

  const lazySpaceInputFilter = useCallback((input: string, key: Key): string => {
    if (!pendingSpaceAfterPillRef.current) return input;
    pendingSpaceAfterPillRef.current = false;
    if (isNonSpacePrintable(input, key)) return ' ' + input;
    return input;
  }, []);

  function insertTextAtCursor(text: string) {
    // Push current state to buffer before inserting
    pushToBuffer(input, cursorOffset, pastedContents);

    const newInput = input.slice(0, cursorOffset) + text + input.slice(cursorOffset);
    trackAndSetInput(newInput);
    setCursorOffset(cursorOffset + text.length);
  }

  const doublePressEscFromEmpty = useDoublePress(
    () => {},
    () => onShowMessageSelector(),
  );

  // 获取待编辑的排队命令的函数。如果弹出了命令则返回 true。
  const popAllCommandsFromQueue = useCallback((): boolean => {
    const result = popAllEditable(input, cursorOffset);
    if (!result) {
      return false;
    }

    trackAndSetInput(result.text);
    onModeChange('prompt'); // Always prompt mode for queued commands
    setCursorOffset(result.cursorOffset);

    // 从排队命令中恢复图像到 pastedContents
    if (result.images.length > 0) {
      setPastedContents(prev => {
        const newContents = { ...prev };
        for (const image of result.images) {
          newContents[image.id] = image;
        }
        return newContents;
      });
    }

    return true;
  }, [trackAndSetInput, onModeChange, input, cursorOffset, setPastedContents]);

  // 当我们收到 IDE 的 @提及通知时，插
  // 入 @提及的引用（文件以及可选的代码行范围）
  const onIdeAtMentioned = function (atMentioned: IDEAtMentioned) {
    logEvent('tengu_ext_at_mentioned', {});
    let atMentionedText: string;
    const relativePath = path.relative(getCwd(), atMentioned.filePath);
    if (atMentioned.lineStart && atMentioned.lineEnd) {
      atMentionedText =
        atMentioned.lineStart === atMentioned.lineEnd
          ? `@${relativePath}#L${atMentioned.lineStart} `
          : `@${relativePath}#L${atMentioned.lineStart}-${atMentioned.lineEnd} `;
    } else {
      atMentionedText = `@${relativePath} `;
    }
    const cursorChar = input[cursorOffset - 1] ?? ' ';
    if (!/\s/.test(cursorChar)) {
      atMentionedText = ` ${atMentionedText}`;
    }
    insertTextAtCursor(atMentionedText);
  };
  useIdeAtMentioned(mcpClients, onIdeAtMentioned);

  // chat:undo 的处理程序 - 撤销上一次编辑
  const handleUndo = useCallback(() => {
    if (canUndo) {
      const previousState = undo();
      if (previousState) {
        trackAndSetInput(previousState.text);
        setCursorOffset(previousState.cursorOffset);
        setPastedContents(previousState.pastedContents);
      }
    }
  }, [canUndo, undo, trackAndSetInput, setPastedContents]);

  // chat:newline 的处理程序 - 在光标位置插入换行符
  const handleNewline = useCallback(() => {
    pushToBuffer(input, cursorOffset, pastedContents);
    const newInput = input.slice(0, cursorOffset) + '\n' + input.slice(cursorOffset);
    trackAndSetInput(newInput);
    setCursorOffset(cursorOffset + 1);
  }, [input, cursorOffset, trackAndSetInput, setCursorOffset, pushToBuffer, pastedContents]);

  // chat:externalEditor 的处理程序 - 在 $EDITOR 中编辑
  const handleExternalEditor = useCallback(async () => {
    logEvent('tengu_external_editor_used', {});
    setIsExternalEditorActive(true);

    try {
      // Pass pastedContents to expand collapsed text references
      const result = await editPromptInEditor(input, pastedContents);

      if (result.error) {
        addNotification({
          key: 'external-editor-error',
          text: result.error,
          color: 'warning',
          priority: 'high',
        });
      }

      if (result.content !== null && result.content !== input) {
        // Push current state to buffer before making changes
        pushToBuffer(input, cursorOffset, pastedContents);

        trackAndSetInput(result.content);
        setCursorOffset(result.content.length);
      }
    } catch (err) {
      if (err instanceof Error) {
        logError(err);
      }
      addNotification({
        key: 'external-editor-error',
        text: `外部编辑器失败：${errorMessage(err)}`,
        color: 'warning',
        priority: 'high',
      });
    } finally {
      setIsExternalEditorActive(false);
    }
  }, [input, cursorOffset, pastedContents, pushToBuffer, trackAndSetInput, addNotification]);

  // chat:stash 的处理程序 - 暂存/取消暂存提示
  const handleStash = useCallback(() => {
    if (input.trim() === '' && stashedPrompt !== undefined) {
      // Pop stash when input is empty
      trackAndSetInput(stashedPrompt.text);
      setCursorOffset(stashedPrompt.cursorOffset);
      setPastedContents(stashedPrompt.pastedContents);
      setStashedPrompt(undefined);
    } else if (input.trim() !== '') {
      // Push to stash (save text, cursor position, and pasted contents)
      setStashedPrompt({ text: input, cursorOffset, pastedContents });
      trackAndSetInput('');
      setCursorOffset(0);
      setPastedContents({});
      // Track usage for /discover and stop showing hint
      saveGlobalConfig(c => {
        if (c.hasUsedStash) return c;
        return { ...c, hasUsedStash: true };
      });
    }
  }, [input, cursorOffset, stashedPrompt, trackAndSetInput, setStashedPrompt, pastedContents, setPastedContents]);

  // chat:modelPicker 的处理程序 - 切换模型选择器
  const handleModelPicker = useCallback(() => {
    setShowModelPicker(prev => !prev);
    if (helpOpen) {
      setHelpOpen(false);
    }
  }, [helpOpen]);

  // chat:fastMode 的处理程序 - 切换快速模式选择器
  const handleFastModePicker = useCallback(() => {
    setShowFastModePicker(prev => !prev);
    if (helpOpen) {
      setHelpOpen(false);
    }
  }, [helpOpen]);

  // chat:thinkingToggle 的处理程序 - 切换思考模式
  const handleThinkingToggle = useCallback(() => {
    setShowThinkingToggle(prev => !prev);
    if (helpOpen) {
      setHelpOpen(false);
    }
  }, [helpOpen]);

  // chat:cycleMode 的处理程序 - 循环切换权限模式
  const handleCycleMode = useCallback(() => {
    // 当查看队友时，循环切换他们的模式而非队长的模式
    if (isAgentSwarmsEnabled() && viewedTeammate && viewingAgentTaskId) {
      const teammateContext: ToolPermissionContext = {
        ...toolPermissionContext,
        mode: viewedTeammate.permissionMode,
      };
      // Pass undefined for teamContext (unused but kept for API compatibility)
      const nextMode = getNextPermissionMode(teammateContext, undefined);

      logEvent('tengu_mode_cycle', {
        to: nextMode as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });

      const teammateTaskId = viewingAgentTaskId;
      setAppState(prev => {
        const task = prev.tasks[teammateTaskId];
        if (!task || task.type !== 'in_process_teammate') {
          return prev;
        }
        if (task.permissionMode === nextMode) {
          return prev;
        }
        return {
          ...prev,
          tasks: {
            ...prev.tasks,
            [teammateTaskId]: {
              ...task,
              permissionMode: nextMode,
            },
          },
        };
      });

      if (helpOpen) {
        setHelpOpen(false);
      }
      return;
    }

    // Compute the next mode without triggering side effects first
    logForDebugging(`[auto-mode] handleCycleMode: currentMode=${toolPermissionContext.mode}`);
    const nextMode = getNextPermissionMode(toolPermissionContext, teamContext);

    // Call cyclePermissionMode to apply side effects (e.g. strip
    // dangerous permissions, activate classifier)
    const { context: preparedContext } = cyclePermissionMode(toolPermissionContext, teamContext);

    logEvent('tengu_mode_cycle', {
      to: nextMode as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });

    // 追踪用户何时进入计划模式
    if (nextMode === 'plan') {
      saveGlobalConfig(current => ({
        ...current,
        lastPlanModeUse: Date.now(),
      }));
    }

    // 通过 setAppState 直接设置模式，因为 setToolPermissionContext
    // 有意保留现有模式（以防止工作进程破坏协调器模式）。
    // 然后调用 setToolPermissionContext 以触发
    // 对排队权限提示的重新检查。
    setAppState(prev => ({
      ...prev,
      toolPermissionContext: {
        ...preparedContext,
        mode: nextMode,
      },
    }));
    setToolPermissionContext({
      ...preparedContext,
      mode: nextMode,
    });

    // If this is a teammate, update config.json so team lead sees the change
    syncTeammateMode(nextMode, teamContext?.teamName);

    // 在模式切换时，如果帮助提示已打开，则关闭它们
    if (helpOpen) {
      setHelpOpen(false);
    }
  }, [toolPermissionContext, teamContext, viewedTeammate, setAppState, setToolPermissionContext, helpOpen]);

  // 处理 chat:imagePaste - 从剪贴板粘贴图像
  const handleImagePaste = useCallback(() => {
    void getImageFromClipboard().then(imageData => {
      if (imageData) {
        onImagePaste(imageData.base64, imageData.mediaType);
      } else {
        const shortcutDisplay = getShortcutDisplay('chat:imagePaste', 'Chat', 'ctrl+v');
        const message = env.isSSH()
          ? "No image found in clipboard. You're SSH'd; try scp?"
          : `No image found in clipboard. Use ${shortcutDisplay} to paste images.`;
        addNotification({
          key: 'no-image-in-clipboard',
          text: message,
          priority: 'immediate',
          timeoutMs: 1000,
        });
      }
    });
  }, [addNotification, onImagePaste]);

  // Register chat:submit handler directly in the handler registry (not via
  // useKeybindings) so that only the ChordInterceptor can invoke it for chord
  // completions (e.g., "ctrl+e s"). The default Enter binding for submit is
  // handled by TextInput directly (via onSubmit prop) and useTypeahead (for
  // autocomplete acceptance). Using useKeybindings would cause
  // stopImmediatePropagation on Enter, blocking autocomplete from seeing the key.
  const keybindingContext = useOptionalKeybindingContext();
  useEffect(() => {
    if (!keybindingContext || isModalOverlayActive) return;
    return keybindingContext.registerHandler({
      action: 'chat:submit',
      context: 'Chat',
      handler: () => {
        void onSubmit(input);
      },
    });
  }, [keybindingContext, isModalOverlayActive, onSubmit, input]);

  // 用于编辑快捷方式的聊天上下文键绑定
  // 注意：history:previous/history:next 不在此处处理。它们作为
  // onHistoryUp/onHistoryDown 属性传递给 TextInput，以便 useTextInput 的
  // upOrHistoryUp/downOrHistoryDown 可以先尝试光标移动，仅当
  // 光标无法进一步移动时才回退到历史记录。
  const chatHandlers = useMemo(
    () => ({
      'chat:undo': handleUndo,
      'chat:newline': handleNewline,
      'chat:externalEditor': handleExternalEditor,
      'chat:stash': handleStash,
      'chat:modelPicker': handleModelPicker,
      'chat:thinkingToggle': handleThinkingToggle,
      'chat:cycleMode': handleCycleMode,
      'chat:imagePaste': handleImagePaste,
    }),
    [
      handleUndo,
      handleNewline,
      handleExternalEditor,
      handleStash,
      handleModelPicker,
      handleThinkingToggle,
      handleCycleMode,
      handleImagePaste,
    ],
  );

  useKeybindings(chatHandlers, {
    context: 'Chat',
    isActive: !isModalOverlayActive,
  });

  // Shift+↑ 进入消息操作光标。使用单独的 isActive，以便 ctrl+r 搜索
  // 在光标退出重新挂载时不会留下陈旧的 isSearchingHistory。
  useKeybinding('chat:messageActions', () => onMessageActionsEnter?.(), {
    context: 'Chat',
    isActive: !isModalOverlayActive && !isSearchingHistory,
  });

  // 快速模式键绑定仅在快速模式启用且可用时激活
  useKeybinding('chat:fastMode', handleFastModePicker, {
    context: 'Chat',
    isActive: !isModalOverlayActive && isFastModeEnabled() && isFastModeAvailable(),
  });

  // 处理 help:dismiss 键绑定（ESC 关闭帮助菜单）
  // 这是与聊天上下文分开注册的，以便在帮助菜单打开时
  // 其优先级高于 CancelRequestHandler
  useKeybinding(
    'help:dismiss',
    () => {
      setHelpOpen(false);
    },
    { context: 'Help', isActive: helpOpen },
  );

  // Quick Open / Global Search. Hook calls are unconditional (Rules of Hooks);
  // the handler body is feature()-gated so the setState calls and component
  // references get tree-shaken in external builds.
  const quickSearchActive = feature('QUICK_SEARCH') ? !isModalOverlayActive : false;
  useKeybinding(
    'app:quickOpen',
    () => {
      if (feature('QUICK_SEARCH')) {
        setShowQuickOpen(true);
        setHelpOpen(false);
      }
    },
    { context: 'Global', isActive: quickSearchActive },
  );
  useKeybinding(
    'app:globalSearch',
    () => {
      if (feature('QUICK_SEARCH')) {
        setShowGlobalSearch(true);
        setHelpOpen(false);
      }
    },
    { context: 'Global', isActive: quickSearchActive },
  );

  useKeybinding(
    'history:search',
    () => {
      if (feature('HISTORY_PICKER')) {
        setShowHistoryPicker(true);
        setHelpOpen(false);
      }
    },
    {
      context: 'Global',
      isActive: feature('HISTORY_PICKER') ? !isModalOverlayActive : false,
    },
  );

  // 处理 Ctrl+C 以在空闲（非加载）时中止推测
  // CancelRequestHandler 仅处理活动任务期间的 Ctrl+C
  useKeybinding(
    'app:interrupt',
    () => {
      abortSpeculation(setAppState);
    },
    {
      context: 'Global',
      isActive: !isLoading && speculation.status === 'active',
    },
  );

  // 页脚指示器导航键绑定。↑/↓ 在此处处理（不在
  // 处理历史记录上/下导航，因为当药丸被选中时 TextInput 焦点=false
  // ——其 useInput 处于非活动状态，所以这是唯一的路径。
  useKeybindings(
    {
      'footer:up': () => {
        // ↑ 在离开药丸前，在协调员任务列表内滚动
        if (
          tasksSelected &&
          process.env.USER_TYPE === 'ant' &&
          coordinatorTaskCount > 0 &&
          coordinatorTaskIndex > minCoordinatorIndex
        ) {
          setCoordinatorTaskIndex(prev => prev - 1);
          return;
        }
        navigateFooter(-1, true);
      },
      'footer:down': () => {
        // ↓ scrolls within the coordinator task list, never leaves the pill
        if (tasksSelected && process.env.USER_TYPE === 'ant' && coordinatorTaskCount > 0) {
          if (coordinatorTaskIndex < coordinatorTaskCount - 1) {
            setCoordinatorTaskIndex(prev => prev + 1);
          }
          return;
        }
        if (tasksSelected && !isTeammateMode) {
          setShowBashesDialog(true);
          selectFooterItem(null);
          return;
        }
        navigateFooter(1);
      },
      'footer:next': () => {
        // 队友模式：←/→ 在团队成员列表中循环
        if (tasksSelected && isTeammateMode) {
          const totalAgents = 1 + inProcessTeammates.length;
          setTeammateFooterIndex(prev => (prev + 1) % totalAgents);
          return;
        }
        navigateFooter(1);
      },
      'footer:previous': () => {
        if (tasksSelected && isTeammateMode) {
          const totalAgents = 1 + inProcessTeammates.length;
          setTeammateFooterIndex(prev => (prev - 1 + totalAgents) % totalAgents);
          return;
        }
        navigateFooter(-1);
      },
      'footer:openSelected': () => {
        if (viewSelectionMode === 'selecting-agent') {
          return;
        }
        switch (footerItemSelected) {
          case 'companion':
            if (feature('BUDDY')) {
              selectFooterItem(null);
              void onSubmit('/buddy');
            }
            break;
          case 'tasks':
            if (isTeammateMode) {
              // Enter 切换到所选智能体的视图
              if (teammateFooterIndex === 0) {
                exitTeammateView(setAppState);
              } else {
                const teammate = inProcessTeammates[teammateFooterIndex - 1];
                if (teammate) enterTeammateView(teammate.id, setAppState);
              }
            } else if (coordinatorTaskIndex === 0 && coordinatorTaskCount > 0) {
              exitTeammateView(setAppState);
            } else {
              const selectedTaskId = getVisibleAgentTasks(tasks)[coordinatorTaskIndex - 1]?.id;
              if (selectedTaskId) {
                enterTeammateView(selectedTaskId, setAppState);
              } else {
                setShowBashesDialog(true);
                selectFooterItem(null);
              }
            }
            break;
          case 'tmux':
            if (process.env.USER_TYPE === 'ant') {
              setAppState(prev =>
                prev.tungstenPanelAutoHidden
                  ? { ...prev, tungstenPanelAutoHidden: false }
                  : {
                      ...prev,
                      tungstenPanelVisible: !(prev.tungstenPanelVisible ?? true),
                    },
              );
            }
            break;
          case 'bagel':
            break;
          case 'teams':
            setShowTeamsDialog(true);
            selectFooterItem(null);
            break;
          case 'bridge':
            setShowBridgeDialog(true);
            selectFooterItem(null);
            break;
        }
      },
      'footer:clearSelection': () => {
        selectFooterItem(null);
      },
      'footer:close': () => {
        if (tasksSelected && coordinatorTaskIndex >= 1) {
          const task = getVisibleAgentTasks(tasks)[coordinatorTaskIndex - 1];
          if (!task) return false;
          // When the selected row IS the viewed agent, 'x' types into the
          // steering input. Any other row — dismiss it.
          if (viewSelectionMode === 'viewing-agent' && task.id === viewingAgentTaskId) {
            onChange(input.slice(0, cursorOffset) + 'x' + input.slice(cursorOffset));
            setCursorOffset(cursorOffset + 1);
            return;
          }
          stopOrDismissAgent(task.id, setAppState);
          if (task.status !== 'running') {
            setCoordinatorTaskIndex(i => Math.max(minCoordinatorIndex, i - 1));
          }
          return;
        }
        // Not handled — let 'x' fall through to type-to-exit
        return false;
      },
    },
    {
      context: 'Footer',
      isActive: !!footerItemSelected && !isModalOverlayActive,
    },
  );

  useInput((char, key) => {
    // Skip all input handling when a full-screen dialog is open. These dialogs
    // render via early return, but hooks run unconditionally — so without this
    // guard, Escape inside a dialog leaks to the double-press message-selector.
    if (showTeamsDialog || showQuickOpen || showGlobalSearch || showHistoryPicker) {
      return;
    }

    // 检测 macOS 上失败的 Alt 快捷键（Option 键产生特殊字符）
    if (getPlatform() === 'macos' && isMacosOptionChar(char)) {
      const shortcut = MACOS_OPTION_SPECIAL_CHARS[char];
      const terminalName = getNativeCSIuTerminalDisplayName();
      const jsx = terminalName ? (
        <Text dimColor>
          To enable {shortcut}, set <Text bold>Option as Meta</Text> in {terminalName} preferences (⌘,)
        </Text>
      ) : (
        <Text dimColor>To enable {shortcut}, run /terminal-setup</Text>
      );
      addNotification({
        key: 'option-meta-hint',
        jsx,
        priority: 'immediate',
        timeoutMs: 5000,
      });
      // Don't return - let the character be typed so user sees the issue
    }

    // 页脚导航通过上方的 useKeybindings 处理（页脚上下文）

    // 注意：ctrl+_、ctrl+g、ctrl+s 通过上方的聊天上下文快捷键处理

    // Type-to-exit footer: printable chars while a pill is selected refocus
    // the input and type the char. Nav keys are captured by useKeybindings
    // above, so anything reaching here is genuinely not a footer action.
    // onChange clears footerSelection, so no explicit deselect.
    if (footerItemSelected && char && !key.ctrl && !key.meta && !key.escape && !key.return) {
      onChange(input.slice(0, cursorOffset) + char + input.slice(cursorOffset));
      setCursorOffset(cursorOffset + char.length);
      return;
    }

    // Exit special modes when backspace/escape/delete/ctrl+u is pressed at cursor position 0
    if (cursorOffset === 0 && (key.escape || key.backspace || key.delete || (key.ctrl && char === 'u'))) {
      onModeChange('prompt');
      setHelpOpen(false);
    }

    // 当按下退格键且输入为空时，退出帮助模式
    if (helpOpen && input === '' && (key.backspace || key.delete)) {
      setHelpOpen(false);
    }

    // esc 键有点超载：
    // - 当我们正在加载响应时，它用于取消请求
    // - 否则，它用于显示消息选择器
    // - 当双击时，它用于清除输入
    // - 当输入为空时，从命令队列中弹出

    // 处理 ESC 键按下
    if (key.escape) {
      // 中止活跃的推测
      if (speculation.status === 'active') {
        abortSpeculation(setAppState);
        return;
      }

      // 如果可见，关闭侧边问题响应
      if (isSideQuestionVisible && onDismissSideQuestion) {
        onDismissSideQuestion();
        return;
      }

      // 如果帮助菜单已打开，则关闭它
      if (helpOpen) {
        setHelpOpen(false);
        return;
      }

      // 页脚选择清除现在通过页脚上下文快捷键处理
      // (footer:clearSelection 操作绑定到 escape 键)
      // 如果选中了页脚项，让页脚快捷键处理它
      if (footerItemSelected) {
        return;
      }

      // If there's an editable queued command, move it to the input for editing when ESC is pressed
      const hasEditableCommand = queuedCommands.some(isQueuedCommandEditable);
      if (hasEditableCommand) {
        void popAllCommandsFromQueue();
        return;
      }

      if (messages.length > 0 && !input && !isLoading) {
        doublePressEscFromEmpty();
      }
    }

    if (key.return && helpOpen) {
      setHelpOpen(false);
    }
  });

  const swarmBanner = useSwarmBanner();

  const fastModeCooldown = isFastModeEnabled() ? isFastModeCooldown() : false;
  const showFastIcon = isFastModeEnabled() ? isFastMode && (isFastModeAvailable() || fastModeCooldown) : false;

  const showFastIconHint = useShowFastIconHint(showFastIcon ?? false);

  // Show effort notification on startup and when effort changes.
  // Suppressed in brief/assistant mode — the value reflects the local
  // client's effort, not the connected agent's.
  const effortNotificationText = briefOwnsGap ? undefined : getEffortNotificationText(effortValue, mainLoopModel);
  useEffect(() => {
    if (!effortNotificationText) {
      removeNotification('effort-level');
      return;
    }
    addNotification({
      key: 'effort-level',
      text: effortNotificationText,
      priority: 'high',
      timeoutMs: 12_000,
    });
  }, [effortNotificationText, addNotification, removeNotification]);

  useBuddyNotification();

  const companionSpeaking = feature('BUDDY') ? useAppState(s => s.companionReaction !== undefined) : false;
  const { columns, rows } = useTerminalSize();
  const textInputColumns = columns - 3 - companionReservedColumns(columns, companionSpeaking);

  // 概念验证：点击定位光标。鼠标跟踪仅在
  // <AlternateScreen> 内部启用，因此在普通主屏幕 REPL 中此功能处于休眠状态。
  // localCol/localRow 相对于 onClick 方框的左上角；该方框
  // 紧密包裹文本输入，因此它们直接映射到 Cursor 包装模型中的
  // (列, 行)。MeasuredText.getOffsetFromPosition 处理
  // 宽字符、换行，并将超出末尾的点击限制在行尾。
  const maxVisibleLines = isFullscreenEnvEnabled()
    ? Math.max(MIN_INPUT_VIEWPORT_LINES, Math.floor(rows / 2) - PROMPT_FOOTER_LINES)
    : undefined;

  const handleInputClick = useCallback(
    (e: ClickEvent) => {
      // During history search the displayed text is historyMatch, not
      // input, and showCursor is false anyway — skip rather than
      // compute an offset against the wrong string.
      if (!input || isSearchingHistory) return;
      const c = Cursor.fromText(input, textInputColumns, cursorOffset);
      const viewportStart = c.getViewportStartLine(maxVisibleLines);
      const offset = c.measuredText.getOffsetFromPosition({
        line: e.localRow + viewportStart,
        column: e.localCol,
      });
      setCursorOffset(offset);
    },
    [input, textInputColumns, isSearchingHistory, cursorOffset, maxVisibleLines],
  );

  const handleOpenTasksDialog = useCallback(
    (taskId?: string) => setShowBashesDialog(taskId ?? true),
    [setShowBashesDialog],
  );

  const placeholder = showPromptSuggestion && promptSuggestion ? promptSuggestion : defaultPlaceholder;

  // Calculate if input has multiple lines
  const isInputWrapped = useMemo(() => input.includes('\n'), [input]);

  // 模型选择器的记忆化回调，防止不相关
  // 状态（如通知）变化时重新渲染。这可以防止内联模型选择器
  // 在通知到达时视觉上“跳动”。
  const handleModelSelect = useCallback(
    (model: string | null, _effort: EffortLevel | undefined) => {
      let wasFastModeDisabled = false;
      setAppState(prev => {
        wasFastModeDisabled = isFastModeEnabled() && !isFastModeSupportedByModel(model) && !!prev.fastMode;
        return {
          ...prev,
          mainLoopModel: model,
          mainLoopModelForSession: null,
          // 如果切换到不支持快速模式的模型，则关闭快速模式
          ...(wasFastModeDisabled && { fastMode: false }),
        };
      });
      setShowModelPicker(false);
      const effectiveFastMode = (isFastMode ?? false) && !wasFastModeDisabled;
      let message = `Model set to ${modelDisplayString(model)}`;
      if (isBilledAsExtraUsage(model, effectiveFastMode, isOpus1mMergeEnabled())) {
        message += ' · Billed as extra usage';
      }
      if (wasFastModeDisabled) {
        message += ' · Fast mode OFF';
      }
      addNotification({
        key: 'model-switched',
        jsx: <Text>{message}</Text>,
        priority: 'immediate',
        timeoutMs: 3000,
      });
      logEvent('tengu_model_picker_hotkey', {
        model: model as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });
    },
    [setAppState, addNotification, isFastMode],
  );

  const handleModelCancel = useCallback(() => {
    setShowModelPicker(false);
  }, []);

  // 记忆化模型选择器元素，防止因不相关原因（例如，通知到达）
  // 导致 AppState 变化时不必要的重新渲染
  const modelPickerElement = useMemo(() => {
    if (!showModelPicker) return null;
    return (
      <Box flexDirection="column" marginTop={1}>
        <ModelPicker
          initial={mainLoopModel_}
          sessionModel={mainLoopModelForSession}
          onSelect={handleModelSelect}
          onCancel={handleModelCancel}
          isStandaloneCommand
          showFastModeNotice={
            isFastModeEnabled() && isFastMode && isFastModeSupportedByModel(mainLoopModel_) && isFastModeAvailable()
          }
        />
      </Box>
    );
  }, [showModelPicker, mainLoopModel_, mainLoopModelForSession, handleModelSelect, handleModelCancel]);

  const handleFastModeSelect = useCallback(
    (result?: string) => {
      setShowFastModePicker(false);
      if (result) {
        addNotification({
          key: 'fast-mode-toggled',
          jsx: <Text>{result}</Text>,
          priority: 'immediate',
          timeoutMs: 3000,
        });
      }
    },
    [addNotification],
  );

  // 记忆化快速模式选择器元素
  const fastModePickerElement = useMemo(() => {
    if (!showFastModePicker) return null;
    return (
      <Box flexDirection="column" marginTop={1}>
        <FastModePicker onDone={handleFastModeSelect} unavailableReason={getFastModeUnavailableReason()} />
      </Box>
    );
  }, [showFastModePicker, handleFastModeSelect]);

  // 思考切换的记忆化回调
  const handleThinkingSelect = useCallback(
    (enabled: boolean) => {
      setAppState(prev => ({
        ...prev,
        thinkingEnabled: enabled,
      }));
      setShowThinkingToggle(false);
      logEvent('tengu_thinking_toggled_hotkey', { enabled });
      addNotification({
        key: 'thinking-toggled-hotkey',
        jsx: (
          <Text color={enabled ? 'suggestion' : undefined} dimColor={!enabled}>
            Thinking {enabled ? 'on' : 'off'}
          </Text>
        ),
        priority: 'immediate',
        timeoutMs: 3000,
      });
    },
    [setAppState, addNotification],
  );

  const handleThinkingCancel = useCallback(() => {
    setShowThinkingToggle(false);
  }, []);

  // 记忆化思考切换元素
  const thinkingToggleElement = useMemo(() => {
    if (!showThinkingToggle) return null;
    return (
      <Box flexDirection="column" marginTop={1}>
        <ThinkingToggle
          currentValue={thinkingEnabled ?? true}
          onSelect={handleThinkingSelect}
          onCancel={handleThinkingCancel}
          isMidConversation={messages.some(m => m.type === 'assistant')}
        />
      </Box>
    );
  }, [showThinkingToggle, thinkingEnabled, handleThinkingSelect, handleThinkingCancel, messages.length]);

  // Portal dialog to DialogOverlay in fullscreen so it escapes the bottom
  // slot's overflowY:hidden clip (same pattern as SuggestionsOverlay).
  // Must be called before early returns below to satisfy rules-of-hooks.
  useSetPromptOverlayDialog(null);

  if (showBashesDialog) {
    return (
      <BackgroundTasksDialog
        onDone={() => setShowBashesDialog(false)}
        toolUseContext={getToolUseContext(messages, [], new AbortController(), mainLoopModel)}
        initialDetailTaskId={typeof showBashesDialog === 'string' ? showBashesDialog : undefined}
      />
    );
  }

  if (isAgentSwarmsEnabled() && showTeamsDialog) {
    return (
      <TeamsDialog
        initialTeams={cachedTeams}
        onDone={() => {
          setShowTeamsDialog(false);
        }}
      />
    );
  }

  if (feature('QUICK_SEARCH')) {
    const insertWithSpacing = (text: string) => {
      const cursorChar = input[cursorOffset - 1] ?? ' ';
      insertTextAtCursor(/\s/.test(cursorChar) ? text : ` ${text}`);
    };
    if (showQuickOpen) {
      return <QuickOpenDialog onDone={() => setShowQuickOpen(false)} onInsert={insertWithSpacing} />;
    }
    if (showGlobalSearch) {
      return <GlobalSearchDialog onDone={() => setShowGlobalSearch(false)} onInsert={insertWithSpacing} />;
    }
  }

  if (feature('HISTORY_PICKER') && showHistoryPicker) {
    return (
      <HistorySearchDialog
        initialQuery={input}
        onSelect={entry => {
          const entryMode = getModeFromInput(entry.display);
          const value = getValueFromInput(entry.display);
          onModeChange(entryMode);
          trackAndSetInput(value);
          setPastedContents(entry.pastedContents);
          setCursorOffset(value.length);
          setShowHistoryPicker(false);
        }}
        onCancel={() => setShowHistoryPicker(false)}
      />
    );
  }

  // 仅在请求时显示循环模式菜单（仅限 ant 内部版本，外部构建中已移除）
  if (modelPickerElement) {
    return modelPickerElement;
  }

  if (fastModePickerElement) {
    return fastModePickerElement;
  }

  if (thinkingToggleElement) {
    return thinkingToggleElement;
  }

  if (showBridgeDialog) {
    return (
      <BridgeDialog
        onDone={() => {
          setShowBridgeDialog(false);
          selectFooterItem(null);
        }}
      />
    );
  }

  const baseProps: BaseTextInputProps = {
    multiline: true,
    onSubmit,
    onChange,
    value: historyMatch
      ? getValueFromInput(typeof historyMatch === 'string' ? historyMatch : historyMatch.display)
      : input,
    // 历史记录导航通过 TextInput 属性（onHistoryUp/onHistoryDown）处理，
    // 而非通过 useKeybindings。这使得 useTextInput 的 upOrHistoryUp/downOrHistoryDown
    // 能够先尝试移动光标，仅当光标无法继续移动时才回退到历史记录导航
    // （这对于换行文本和多行输入尤为重要）。
    onHistoryUp: handleHistoryUp,
    onHistoryDown: handleHistoryDown,
    onHistoryReset: resetHistory,
    placeholder,
    onExit,
    onExitMessage: (show, key) => setExitMessage({ show, key }),
    onImagePaste,
    columns: textInputColumns,
    maxVisibleLines,
    disableCursorMovementForUpDownKeys: suggestions.length > 0 || !!footerItemSelected,
    disableEscapeDoublePress: suggestions.length > 0,
    cursorOffset,
    onChangeCursorOffset: setCursorOffset,
    onPaste: onTextPaste,
    onIsPastingChange: setIsPasting,
    focus: !isSearchingHistory && !isModalOverlayActive && !footerItemSelected,
    showCursor: !footerItemSelected && !isSearchingHistory && !cursorAtImageChip,
    argumentHint: commandArgumentHint,
    onUndo: canUndo
      ? () => {
          const previousState = undo();
          if (previousState) {
            trackAndSetInput(previousState.text);
            setCursorOffset(previousState.cursorOffset);
            setPastedContents(previousState.pastedContents);
          }
        }
      : undefined,
    highlights: combinedHighlights,
    inlineGhostText,
    inputFilter: lazySpaceInputFilter,
  };

  const getBorderColor = (): keyof Theme => {
    const modeColors: Record<string, keyof Theme> = {
      bash: 'bashBorder',
    };

    // 模式颜色优先级最高，其次是队友颜色，最后是默认颜色
    if (modeColors[mode]) {
      return modeColors[mode];
    }

    // 进程内队友以无头模式运行 - 不将队友颜色应用于领导者 UI
    if (isInProcessTeammate()) {
      return 'promptBorder';
    }

    // Check for teammate color from environment
    const teammateColorName = getTeammateColor();
    if (teammateColorName && AGENT_COLORS.includes(teammateColorName as AgentColorName)) {
      return AGENT_COLOR_TO_THEME_COLOR[teammateColorName as AgentColorName];
    }

    return 'promptBorder';
  };

  if (isExternalEditorActive) {
    return (
      <Box
        flexDirection="row"
        alignItems="center"
        justifyContent="center"
        borderColor={getBorderColor()}
        borderStyle="round"
        borderLeft={false}
        borderRight={false}
        borderBottom
        width="100%"
      >
        <Text dimColor italic>
          Save and close editor to continue...
        </Text>
      </Box>
    );
  }

  const textInputElement = isVimModeEnabled() ? (
    <VimTextInput {...baseProps} initialMode={vimMode} onModeChange={setVimMode} />
  ) : (
    <TextInput {...baseProps} />
  );

  return (
    <Box flexDirection="column" marginTop={briefOwnsGap ? 0 : 1}>
      {!isFullscreenEnvEnabled() && <PromptInputQueuedCommands />}
      {hasSuppressedDialogs && (
        <Box marginTop={1} marginLeft={2}>
          <Text dimColor>Waiting for permission…</Text>
        </Box>
      )}
      <PromptInputStashNotice hasStash={stashedPrompt !== undefined} />
      {swarmBanner ? (
        <>
          <Text color={swarmBanner.bgColor}>
            {swarmBanner.text ? (
              <>
                {'─'.repeat(Math.max(0, columns - stringWidth(swarmBanner.text) - 4))}
                <Text backgroundColor={swarmBanner.bgColor} color="inverseText">
                  {' '}
                  {swarmBanner.text}{' '}
                </Text>
                {'──'}
              </>
            ) : (
              '─'.repeat(columns)
            )}
          </Text>
          <Box flexDirection="row" width="100%">
            <PromptInputModeIndicator
              mode={mode}
              isLoading={isLoading}
              viewingAgentName={viewingAgentName}
              viewingAgentColor={viewingAgentColor}
            />
            <Box flexGrow={1} flexShrink={1} onClick={handleInputClick}>
              {textInputElement}
            </Box>
          </Box>
          <Text color={swarmBanner.bgColor}>{'─'.repeat(columns)}</Text>
        </>
      ) : (
        <Box
          flexDirection="row"
          alignItems="flex-start"
          justifyContent="flex-start"
          borderColor={getBorderColor()}
          borderStyle="round"
          borderLeft={false}
          borderRight={false}
          borderBottom
          width="100%"
          borderText={buildBorderText(showFastIcon ?? false, showFastIconHint, fastModeCooldown)}
        >
          <PromptInputModeIndicator
            mode={mode}
            isLoading={isLoading}
            viewingAgentName={viewingAgentName}
            viewingAgentColor={viewingAgentColor}
          />
          <Box flexGrow={1} flexShrink={1} onClick={handleInputClick}>
            {textInputElement}
          </Box>
        </Box>
      )}
      <PromptInputFooter
        apiKeyStatus={apiKeyStatus}
        debug={debug}
        exitMessage={exitMessage}
        vimMode={isVimModeEnabled() ? vimMode : undefined}
        mode={mode}
        autoUpdaterResult={autoUpdaterResult}
        isAutoUpdating={isAutoUpdating}
        verbose={verbose}
        onAutoUpdaterResult={onAutoUpdaterResult}
        onChangeIsUpdating={setIsAutoUpdating}
        suggestions={suggestions}
        selectedSuggestion={selectedSuggestion}
        maxColumnWidth={maxColumnWidth}
        toolPermissionContext={effectiveToolPermissionContext}
        helpOpen={helpOpen}
        suppressHint={input.length > 0}
        isLoading={isLoading}
        tasksSelected={tasksSelected}
        teamsSelected={teamsSelected}
        bridgeSelected={bridgeSelected}
        tmuxSelected={tmuxSelected}
        teammateFooterIndex={teammateFooterIndex}
        ideSelection={ideSelection}
        mcpClients={mcpClients}
        isPasting={isPasting}
        isInputWrapped={isInputWrapped}
        messages={messages}
        isSearching={isSearchingHistory}
        historyQuery={historyQuery}
        setHistoryQuery={setHistoryQuery}
        historyFailedMatch={historyFailedMatch}
        onOpenTasksDialog={isFullscreenEnvEnabled() ? handleOpenTasksDialog : undefined}
      />
      {isFullscreenEnvEnabled() ? (
        // position=absolute 不占布局高度，因此当通知出现/消失时，旋转器不会移动位置。
        // Yoga 将绝对定位的子元素锚定在父元素内容框的原点；marginTop=-1 将其拉入提示边框上方的 marginTop=1 间隙行。
        // 在简洁模式下，没有这样的间隙（briefOwnsGap 会移除我们的 marginTop），BriefSpinner 紧贴边框放置 — marginTop=-2 会跳过旋转器内容进入 BriefSpinner 自己的 marginTop=1 空白行。
        // height=1 + overflow=hidden 将多行通知裁剪为单行。
        // flex-end 锚定底部行，因此可见行始终是最新的一条。
        // 当斜杠覆盖层或自动模式选择对话框出现时，通过 height=0（而非卸载）来抑制通知 — 这个 Box 在树顺序中渲染较晚，因此会覆盖它们的底部行。
        // 保持 Notifications 挂载可以防止 AutoUpdater 的初始检查 effect 在每次斜杠命令完成切换时重新触发（PR#22413）。
        <Box
          position="absolute"
          marginTop={briefOwnsGap ? -2 : -1}
          height={suggestions.length === 0 ? 1 : 0}
          width="100%"
          paddingLeft={2}
          paddingRight={1}
          flexDirection="column"
          justifyContent="flex-end"
          overflow="hidden"
        >
          <Notifications
            apiKeyStatus={apiKeyStatus}
            autoUpdaterResult={autoUpdaterResult}
            debug={debug}
            isAutoUpdating={isAutoUpdating}
            verbose={verbose}
            messages={messages}
            onAutoUpdaterResult={onAutoUpdaterResult}
            onChangeIsUpdating={setIsAutoUpdating}
            ideSelection={ideSelection}
            mcpClients={mcpClients}
            isInputWrapped={isInputWrapped}
          />
        </Box>
      ) : null}
    </Box>
  );
}

/**
 * 通过查找现有消息中使用的最大 ID 来计算初始粘贴 ID。
 * 这可以处理 --continue/--resume 场景，避免 ID 冲突。
 */
function getInitialPasteId(messages: Message[]): number {
  let maxId = 0;
  for (const message of messages) {
    if (message.type === 'user') {
      // 检查图像粘贴 ID
      if (message.imagePasteIds) {
        for (const id of message.imagePasteIds as number[]) {
          if (id > maxId) maxId = id;
        }
      }
      // 检查消息内容中的文本粘贴引用
      if (Array.isArray(message.message!.content)) {
        for (const block of message.message!.content) {
          if (block.type === 'text') {
            const refs = parseReferences(block.text);
            for (const ref of refs) {
              if (ref.id > maxId) maxId = ref.id;
            }
          }
        }
      }
    }
  }
  return maxId + 1;
}

function buildBorderText(
  showFastIcon: boolean,
  showFastIconHint: boolean,
  fastModeCooldown: boolean,
): BorderTextOptions | undefined {
  if (!showFastIcon) return undefined;
  const fastSeg = showFastIconHint
    ? `${getFastIconString(true, fastModeCooldown)} ${chalk.dim('/fast')}`
    : getFastIconString(true, fastModeCooldown);
  return {
    content: ` ${fastSeg} `,
    position: 'top',
    align: 'end',
    offset: 0,
  };
}

export default React.memo(PromptInput);
