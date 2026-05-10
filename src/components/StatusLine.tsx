import { feature } from 'bun:bundle';
import * as React from 'react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { logEvent } from 'src/services/analytics/index.js';
import { useAppState, useSetAppState } from 'src/state/AppState.js';
import type { PermissionMode } from 'src/utils/permissions/PermissionMode.js';
import {
  getIsRemoteMode,
  getKairosActive,
  getMainThreadAgentType,
  getOriginalCwd,
  getSdkBetas,
  getSessionId,
} from '../bootstrap/state.js';
import { DEFAULT_OUTPUT_STYLE_NAME } from '../constants/outputStyles.js';
import { useNotifications } from '../context/notifications.js';
import {
  getTotalAPIDuration,
  getTotalCost,
  getTotalDuration,
  getTotalInputTokens,
  getTotalLinesAdded,
  getTotalLinesRemoved,
  getTotalOutputTokens,
} from '../cost-tracker.js';
import { useMainLoopModel } from '../hooks/useMainLoopModel.js';
import { type ReadonlySettings, useSettings } from '../hooks/useSettings.js';
import { Ansi, Box, Text } from '@anthropic/ink';
import { getRawUtilization } from '../services/claudeAiLimits.js';
import type { Message } from '../types/message.js';
import type { StatusLineCommandInput } from '../types/statusLine.js';
import type { VimMode } from '../types/textInputTypes.js';
import { checkHasTrustDialogAccepted } from '../utils/config.js';
import { calculateContextPercentages, getContextWindowForModel } from '../utils/context.js';
import { getCwd } from '../utils/cwd.js';
import { logForDebugging } from '../utils/debug.js';
import { isFullscreenEnvEnabled } from '../utils/fullscreen.js';
import { createBaseHookInput, executeStatusLineCommand } from '../utils/hooks.js';
import { getLastAssistantMessage } from '../utils/messages.js';
import { getRuntimeMainLoopModel, type ModelName, renderModelName } from '../utils/model/model.js';
import { getCurrentSessionTitle } from '../utils/sessionStorage.js';
import { doesMostRecentAssistantMessageExceed200k, getCurrentUsage } from '../utils/tokens.js';
import { getCurrentWorktreeSession } from '../utils/worktree.js';
import { isVimModeEnabled } from './PromptInput/utils.js';
import { computeHitRate, tokenSignature } from '../utils/cacheStats.js';
import { onResponse as cacheOnResponse, getCacheStatsState, initCacheStatsState } from '../utils/cacheStatsState.js';
import { BuiltinStatusLine } from './BuiltinStatusLine.js';

// ---------------------------------------------------------------------------
// CachePill — cache hit-rate + 1-hour TTL countdown pill
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60 * 60 * 1000; // 60 minutes

function padTwo(n: number): string {
  return String(Math.floor(n)).padStart(2, '0');
}

function formatCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return 'exp';
  const mins = Math.floor(remainingMs / 60_000);
  const secs = Math.floor((remainingMs % 60_000) / 1000);
  return `${padTwo(mins)}:${padTwo(secs)}`;
}

type CachePillProps = {
  messages: Message[];
};

function CachePill({ messages }: CachePillProps): React.ReactNode {
  const [now, setNow] = useState(() => Date.now());
  const [isFlashOn, setIsFlashOn] = useState(true);

  const usage = getCurrentUsage(messages);

  // Feed new responses into the in-memory singleton
  const prevSigRef = useRef<string | null>(null);
  if (usage !== null) {
    const sig = tokenSignature(usage);
    if (sig !== prevSigRef.current) {
      prevSigRef.current = sig;
      cacheOnResponse(usage);
    }
  }

  const cacheState = getCacheStatsState();
  const { lastResetAt, lastHitRate } = cacheState;

  // Derived timing
  const elapsed = lastResetAt !== null ? now - lastResetAt : null;
  const remaining = elapsed !== null ? CACHE_TTL_MS - elapsed : null;
  const elapsedMin = elapsed !== null ? elapsed / 60_000 : null;
  const isExpired = remaining !== null && remaining <= 0;

  // 1-second countdown ticker
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // 500ms flash in last 5 minutes
  const inFlashZone = elapsedMin !== null && elapsedMin >= 55 && !isExpired;
  useEffect(() => {
    if (!inFlashZone) {
      setIsFlashOn(true);
      return;
    }
    const id = setInterval(() => setIsFlashOn(v => !v), 500);
    return () => clearInterval(id);
  }, [inFlashZone]);

  // Load persisted fallback once on mount
  const initDoneRef = useRef(false);
  useEffect(() => {
    if (initDoneRef.current) return;
    initDoneRef.current = true;
    const sid = getSessionId();
    void initCacheStatsState(sid);
  }, []);

  const displayHitRate = usage !== null ? computeHitRate(usage) : lastHitRate;

  // No data yet — show placeholder
  if (displayHitRate === null && lastResetAt === null) {
    return <Text dimColor>{' Cache --% --:--'}</Text>;
  }

  const countdownText = remaining !== null ? formatCountdown(remaining) : '--:--';
  const hitRateText = displayHitRate !== null ? `${displayHitRate}%` : '--%';

  // Timer color by elapsed bucket — using theme keys
  type TimerThemeKey = 'success' | 'warning' | 'error' | 'inactive';
  let timerColor: TimerThemeKey;
  if (isExpired || elapsedMin === null) {
    timerColor = 'inactive';
  } else if (elapsedMin < 20) {
    timerColor = 'success';
  } else if (elapsedMin < 40) {
    timerColor = 'warning';
  } else {
    timerColor = 'error';
  }

  // Hit-rate color — using theme keys
  const hitRateColor: 'success' | 'inactive' = displayHitRate !== null && displayHitRate >= 50 ? 'success' : 'inactive';

  return (
    <Text>
      <Text dimColor>{' Cache '}</Text>
      <Text color={hitRateColor}>{hitRateText}</Text>
      <Text color={timerColor} dimColor={inFlashZone && !isFlashOn}>
        {' '}
        {countdownText}
      </Text>
    </Text>
  );
}

export function statusLineShouldDisplay(settings: ReadonlySettings): boolean {
  // Assistant mode: statusline fields (model, permission mode, cwd) reflect the
  // REPL/daemon process, not what the agent child is actually running. Hide it.
  if (feature('KAIROS') && getKairosActive()) return false;
  // Show the status line when explicitly enabled, or when a statusLine command
  // is configured (backward compatibility for users who set statusLine.command
  // without toggling statusLineEnabled). Only hide when explicitly disabled.
  if (settings?.statusLineEnabled === false) return false;
  return settings?.statusLineEnabled === true || !!settings?.statusLine?.command;
}

function buildStatusLineCommandInput(
  permissionMode: PermissionMode,
  exceeds200kTokens: boolean,
  settings: ReadonlySettings,
  messages: Message[],
  addedDirs: string[],
  mainLoopModel: ModelName,
  vimMode?: VimMode,
): StatusLineCommandInput {
  const agentType = getMainThreadAgentType();
  const worktreeSession = getCurrentWorktreeSession();
  const runtimeModel = getRuntimeMainLoopModel({
    permissionMode,
    mainLoopModel,
    exceeds200kTokens,
  });
  const outputStyleName = settings?.outputStyle || DEFAULT_OUTPUT_STYLE_NAME;

  const currentUsage = getCurrentUsage(messages);
  const contextWindowSize = getContextWindowForModel(runtimeModel, getSdkBetas());
  const contextPercentages = calculateContextPercentages(currentUsage, contextWindowSize);

  const sessionId = getSessionId();
  const sessionName = getCurrentSessionTitle(sessionId);
  const rawUtil = getRawUtilization();
  const rateLimits: StatusLineCommandInput['rate_limits'] = {
    ...(rawUtil.five_hour && {
      five_hour: {
        used_percentage: rawUtil.five_hour.utilization * 100,
        resets_at: rawUtil.five_hour.resets_at,
      },
    }),
    ...(rawUtil.seven_day && {
      seven_day: {
        used_percentage: rawUtil.seven_day.utilization * 100,
        resets_at: rawUtil.seven_day.resets_at,
      },
    }),
  };
  return {
    ...createBaseHookInput(),
    ...(sessionName && { session_name: sessionName }),
    model: {
      id: runtimeModel,
      display_name: renderModelName(runtimeModel),
    },
    workspace: {
      current_dir: getCwd(),
      project_dir: getOriginalCwd(),
      added_dirs: addedDirs,
    },
    version: MACRO.VERSION,
    output_style: {
      name: outputStyleName,
    },
    cost: {
      total_cost_usd: getTotalCost(),
      total_duration_ms: getTotalDuration(),
      total_api_duration_ms: getTotalAPIDuration(),
      total_lines_added: getTotalLinesAdded(),
      total_lines_removed: getTotalLinesRemoved(),
    },
    context_window: {
      total_input_tokens: getTotalInputTokens(),
      total_output_tokens: getTotalOutputTokens(),
      context_window_size: contextWindowSize,
      current_usage: currentUsage,
      used_percentage: contextPercentages.used,
      remaining_percentage: contextPercentages.remaining,
    },
    exceeds_200k_tokens: exceeds200kTokens,
    ...((rateLimits.five_hour || rateLimits.seven_day) && {
      rate_limits: rateLimits,
    }),
    ...(isVimModeEnabled() && {
      vim: {
        mode: vimMode ?? 'INSERT',
      },
    }),
    ...(agentType && {
      agent: {
        name: agentType,
      },
    }),
    ...(getIsRemoteMode() && {
      remote: {
        session_id: getSessionId(),
      },
    }),
    ...(worktreeSession && {
      worktree: {
        name: worktreeSession.worktreeName,
        path: worktreeSession.worktreePath,
        branch: worktreeSession.worktreeBranch,
        original_cwd: worktreeSession.originalCwd,
        original_branch: worktreeSession.originalBranch,
      },
    }),
  };
}

type Props = {
  // messages stays behind a ref (read only in the debounced callback);
  // lastAssistantMessageId is the actual re-render trigger.
  messagesRef: React.RefObject<Message[]>;
  lastAssistantMessageId: string | null;
  vimMode?: VimMode;
};

export function getLastAssistantMessageId(messages: Message[]): string | null {
  return getLastAssistantMessage(messages)?.uuid ?? null;
}

function StatusLineInner({ messagesRef, lastAssistantMessageId, vimMode }: Props): React.ReactNode {
  const abortControllerRef = useRef<AbortController | undefined>(undefined);
  const permissionMode = useAppState(s => s.toolPermissionContext.mode);
  const additionalWorkingDirectories = useAppState(s => s.toolPermissionContext.additionalWorkingDirectories);
  const statusLineText = useAppState(s => s.statusLineText);
  const setAppState = useSetAppState();
  const settings = useSettings();
  const { addNotification } = useNotifications();
  // AppState-sourced model — same source as API requests. getMainLoopModel()
  // re-reads settings.json on every call, so another session's /model write
  // would leak into this session's statusline (anthropics/claude-code#37596).
  const mainLoopModel = useMainLoopModel();

  // Keep latest values in refs for stable callback access
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const vimModeRef = useRef(vimMode);
  vimModeRef.current = vimMode;
  const permissionModeRef = useRef(permissionMode);
  permissionModeRef.current = permissionMode;
  const addedDirsRef = useRef(additionalWorkingDirectories);
  addedDirsRef.current = additionalWorkingDirectories;
  const mainLoopModelRef = useRef(mainLoopModel);
  mainLoopModelRef.current = mainLoopModel;

  // Track previous state to detect changes and cache expensive calculations
  const previousStateRef = useRef<{
    messageId: string | null;
    exceeds200kTokens: boolean;
    permissionMode: PermissionMode;
    vimMode: VimMode | undefined;
    mainLoopModel: ModelName;
  }>({
    messageId: null,
    exceeds200kTokens: false,
    permissionMode,
    vimMode,
    mainLoopModel,
  });

  // Debounce timer ref
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // True when the next invocation should log its result (first run or after settings reload)
  const logNextResultRef = useRef(true);

  // Stable update function — reads latest values from refs
  const doUpdate = useCallback(async () => {
    // Cancel any in-flight requests
    abortControllerRef.current?.abort();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const msgs = messagesRef.current;

    const logResult = logNextResultRef.current;
    logNextResultRef.current = false;

    // Skip the shell command path entirely when no command is configured.
    // The top row (BuiltinStatusLine + CachePill) renders unconditionally, so
    // there's nothing to update here when settings.statusLine is missing.
    if (!settingsRef.current?.statusLine?.command) {
      return;
    }

    try {
      let exceeds200kTokens = previousStateRef.current.exceeds200kTokens;

      // Only recalculate 200k check if messages changed
      const currentMessageId = getLastAssistantMessageId(msgs);
      if (currentMessageId !== previousStateRef.current.messageId) {
        exceeds200kTokens = doesMostRecentAssistantMessageExceed200k(msgs);
        previousStateRef.current.messageId = currentMessageId;
        previousStateRef.current.exceeds200kTokens = exceeds200kTokens;
      }

      const statusInput = buildStatusLineCommandInput(
        permissionModeRef.current,
        exceeds200kTokens,
        settingsRef.current,
        msgs,
        Array.from(addedDirsRef.current.keys()),
        mainLoopModelRef.current,
        vimModeRef.current,
      );

      const text = await executeStatusLineCommand(statusInput, controller.signal, undefined, logResult);
      if (!controller.signal.aborted) {
        setAppState(prev => {
          if (prev.statusLineText === text) return prev;
          return { ...prev, statusLineText: text };
        });
      }
    } catch {
      // Silently ignore errors in status line updates
    }
  }, [messagesRef, setAppState]);

  // Stable debounced schedule function — no deps, uses refs
  const scheduleUpdate = useCallback(() => {
    if (debounceTimerRef.current !== undefined) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(
      (ref, doUpdate) => {
        ref.current = undefined;
        void doUpdate();
      },
      300,
      debounceTimerRef,
      doUpdate,
    );
  }, [doUpdate]);

  // Only trigger update when assistant message, permission mode, vim mode, or model actually changes
  useEffect(() => {
    if (
      lastAssistantMessageId !== previousStateRef.current.messageId ||
      permissionMode !== previousStateRef.current.permissionMode ||
      vimMode !== previousStateRef.current.vimMode ||
      mainLoopModel !== previousStateRef.current.mainLoopModel
    ) {
      // Don't update messageId here — let doUpdate handle it so
      // exceeds200kTokens is recalculated with the latest messages
      previousStateRef.current.permissionMode = permissionMode;
      previousStateRef.current.vimMode = vimMode;
      previousStateRef.current.mainLoopModel = mainLoopModel;
      scheduleUpdate();
    }
  }, [lastAssistantMessageId, permissionMode, vimMode, mainLoopModel, scheduleUpdate]);

  // When the statusLine command changes (hot reload), log the next result
  const statusLineCommand = settings?.statusLine?.command;
  const isFirstSettingsRender = useRef(true);
  useEffect(() => {
    if (isFirstSettingsRender.current) {
      isFirstSettingsRender.current = false;
      return;
    }
    logNextResultRef.current = true;
    void doUpdate();
  }, [statusLineCommand, doUpdate]);

  // Separate effect for logging on mount
  useEffect(() => {
    const statusLine = settings?.statusLine;
    if (statusLine) {
      logEvent('tengu_status_line_mount', {
        command_length: statusLine.command.length,
        padding: statusLine.padding,
      });
      // Log if status line is configured but disabled by disableAllHooks
      if (settings.disableAllHooks === true) {
        logForDebugging('Status line is configured but disableAllHooks is true', { level: 'warn' });
      }
      // executeStatusLineCommand (hooks.ts) returns undefined when trust is
      // blocked — statusLineText stays undefined forever, user sees nothing,
      // and tengu_status_line_mount above fires anyway so telemetry looks fine.
      if (!checkHasTrustDialogAccepted()) {
        addNotification({
          key: 'statusline-trust-blocked',
          text: 'statusline skipped · restart to fix',
          color: 'warning',
          priority: 'low',
        });
        logForDebugging('Status line command skipped: workspace trust not accepted', { level: 'warn' });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount - settings stable for initial logging

  // Initial update on mount + cleanup on unmount
  useEffect(() => {
    void doUpdate();

    return () => {
      abortControllerRef.current?.abort();
      if (debounceTimerRef.current !== undefined) {
        clearTimeout(debounceTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount, not when doUpdate changes

  // Get padding from settings or default to 0
  const paddingX = settings?.statusLine?.padding ?? 0;

  // ---- Top row data: feed BuiltinStatusLine (model + ctx + 5h + 7d + cost) ---
  const builtinRuntimeModel = getRuntimeMainLoopModel({
    permissionMode,
    mainLoopModel,
    exceeds200kTokens: previousStateRef.current.exceeds200kTokens,
  });
  const builtinContextWindowSize = getContextWindowForModel(builtinRuntimeModel, getSdkBetas());
  const builtinCurrentUsage = getCurrentUsage(messagesRef.current);
  const builtinUsedTokens = builtinCurrentUsage
    ? builtinCurrentUsage.input_tokens +
      builtinCurrentUsage.cache_creation_input_tokens +
      builtinCurrentUsage.cache_read_input_tokens
    : 0;
  const builtinContextPct = builtinCurrentUsage
    ? Math.round(calculateContextPercentages(builtinCurrentUsage, builtinContextWindowSize).used ?? 0)
    : 0;
  const builtinRawUtil = getRawUtilization();
  const builtinRateLimits = {
    ...(builtinRawUtil.five_hour && {
      five_hour: {
        utilization: builtinRawUtil.five_hour.utilization,
        resets_at: builtinRawUtil.five_hour.resets_at,
      },
    }),
    ...(builtinRawUtil.seven_day && {
      seven_day: {
        utilization: builtinRawUtil.seven_day.utilization,
        resets_at: builtinRawUtil.seven_day.resets_at,
      },
    }),
  };

  // BuiltinStatusLine + CachePill: only when statusLineEnabled is explicitly true.
  // Shell command output: only when a statusLine.command is configured.
  // These are independent — a user can have one, both, or neither.
  const showBuiltin = settings?.statusLineEnabled === true;
  const hasShellCommand = !!settings?.statusLine?.command;

  return (
    <Box flexDirection="column" paddingX={paddingX}>
      {/* Top: built-in fork status (model | ctx | 5h | 7d | cost) + Cache pill */}
      {showBuiltin && (
        <Box gap={2}>
          <BuiltinStatusLine
            modelName={renderModelName(builtinRuntimeModel)}
            contextUsedPct={builtinContextPct}
            usedTokens={builtinUsedTokens}
            contextWindowSize={builtinContextWindowSize}
            totalCostUsd={getTotalCost()}
            rateLimits={builtinRateLimits}
          />
          <CachePill messages={messagesRef.current} />
        </Box>
      )}
      {/* Bottom: user-configured /statusline shell stdout (reserves row in fullscreen) */}
      {statusLineText ? (
        <Text dimColor wrap="truncate">
          <Ansi>{statusLineText}</Ansi>
        </Text>
      ) : hasShellCommand && isFullscreenEnvEnabled() ? (
        <Text> </Text>
      ) : null}
    </Box>
  );
}

// Parent (PromptInputFooter) re-renders on every setMessages, but StatusLine's
// own props now only change when lastAssistantMessageId flips — memo keeps it
// from being dragged along (previously ~18 no-prop-change renders per session).
export const StatusLine = memo(StatusLineInner);
