import { feature } from 'bun:bundle';
import * as React from 'react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { type Notification, useNotifications } from 'src/context/notifications.js';
import { logEvent } from 'src/services/analytics/index.js';
import { useAppState } from 'src/state/AppState.js';
import { useVoiceState } from '../../context/voice.js';
import type { VerificationStatus } from '../../hooks/useApiKeyVerification.js';
import { useIdeConnectionStatus } from '../../hooks/useIdeConnectionStatus.js';
import type { IDESelection } from '../../hooks/useIdeSelection.js';
import { useMainLoopModel } from '../../hooks/useMainLoopModel.js';
import { useVoiceEnabled } from '../../hooks/useVoiceEnabled.js';
import { Box, Text } from '@anthropic/ink';
import { useClaudeAiLimits } from '../../services/claudeAiLimitsHook.js';
import { calculateTokenWarningState } from '../../services/compact/autoCompact.js';
import type { MCPServerConnection } from '../../services/mcp/types.js';
import type { Message } from '../../types/message.js';
import { getApiKeyHelperElapsedMs, getConfiguredApiKeyHelper, getSubscriptionType } from '../../utils/auth.js';
import type { AutoUpdaterResult } from '../../utils/autoUpdater.js';
import { getExternalEditor } from '../../utils/editor.js';
import { isEnvTruthy } from '../../utils/envUtils.js';
import { formatDuration } from '../../utils/format.js';
import { setEnvHookNotifier } from '../../utils/hooks/fileChangedWatcher.js';
import { toIDEDisplayName } from '../../utils/ide.js';
import { getMessagesAfterCompactBoundary } from '../../utils/messages.js';
import { tokenCountFromLastAPIResponse } from '../../utils/tokens.js';
import { ConfigurableShortcutHint } from '../ConfigurableShortcutHint.js';
import { IdeStatusIndicator } from '../IdeStatusIndicator.js';
import { MemoryUsageIndicator } from '../MemoryUsageIndicator.js';
import { SentryErrorBoundary } from '../SentryErrorBoundary.js';
import { TokenWarning } from '../TokenWarning.js';
import { SandboxPromptFooterHint } from './SandboxPromptFooterHint.js';

/* eslint-disable @typescript-eslint/no-require-imports */
const VoiceIndicator: typeof import('./VoiceIndicator.js').VoiceIndicator = feature('VOICE_MODE')
  ? require('./VoiceIndicator.js').VoiceIndicator
  : () => null;
/* eslint-enable @typescript-eslint/no-require-imports */

export const FOOTER_TEMPORARY_STATUS_TIMEOUT = 5000;

type Props = {
  apiKeyStatus: VerificationStatus;
  autoUpdaterResult: AutoUpdaterResult | null;
  isAutoUpdating: boolean;
  debug: boolean;
  verbose: boolean;
  messages: Message[];
  onAutoUpdaterResult: (result: AutoUpdaterResult) => void;
  onChangeIsUpdating: (isUpdating: boolean) => void;
  ideSelection: IDESelection | undefined;
  mcpClients?: MCPServerConnection[];
  isInputWrapped?: boolean;
  isNarrow?: boolean;
};

export function Notifications({
  apiKeyStatus,
  autoUpdaterResult: _autoUpdaterResult,
  debug,
  isAutoUpdating: _isAutoUpdating,
  verbose,
  messages,
  onAutoUpdaterResult: _onAutoUpdaterResult,
  onChangeIsUpdating: _onChangeIsUpdating,
  ideSelection,
  mcpClients,
  isInputWrapped = false,
  isNarrow = false,
}: Props): ReactNode {
  const tokenUsage = useMemo(() => {
    const messagesForTokenCount = getMessagesAfterCompactBoundary(messages);
    return tokenCountFromLastAPIResponse(messagesForTokenCount);
  }, [messages]);

  // AppState-sourced model — same source as API requests. getMainLoopModel()
  // re-reads settings.json on every call, so another session's /model write
  // would leak into this session's display (anthropics/claude-code#37596).
  const mainLoopModel = useMainLoopModel();
  const isShowingCompactMessage = calculateTokenWarningState(tokenUsage, mainLoopModel).isAboveWarningThreshold;
  const { status: ideStatus } = useIdeConnectionStatus(mcpClients);
  const notifications = useAppState(s => s.notifications);
  const { addNotification, removeNotification } = useNotifications();
  const claudeAiLimits = useClaudeAiLimits();

  // Register env hook notifier for CwdChanged/FileChanged feedback
  useEffect(() => {
    setEnvHookNotifier((text, isError) => {
      addNotification({
        key: 'env-hook',
        text,
        color: isError ? 'error' : undefined,
        priority: isError ? 'medium' : 'low',
        timeoutMs: isError ? 8000 : 5000,
      });
    });
    return () => setEnvHookNotifier(null);
  }, [addNotification]);

  // Check if we should show the IDE selection indicator
  const shouldShowIdeSelection =
    ideStatus === 'connected' && (ideSelection?.filePath || (ideSelection?.text && ideSelection.lineCount > 0));

  // Check if we're in overage mode for UI indicators
  const isInOverageMode = claudeAiLimits.isUsingOverage;
  const subscriptionType = getSubscriptionType();
  const isTeamOrEnterprise = subscriptionType === 'team' || subscriptionType === 'enterprise';

  // Check if the external editor hint should be shown
  const editor = getExternalEditor();
  const shouldShowExternalEditorHint =
    isInputWrapped &&
    !isShowingCompactMessage &&
    apiKeyStatus !== 'invalid' &&
    apiKeyStatus !== 'missing' &&
    editor !== undefined;

  // Show external editor hint as notification when input is wrapped
  useEffect(() => {
    if (shouldShowExternalEditorHint && editor) {
      logEvent('tengu_external_editor_hint_shown', {});
      addNotification({
        key: 'external-editor-hint',
        jsx: (
          <Text dimColor>
            <ConfigurableShortcutHint
              action="chat:externalEditor"
              context="Chat"
              fallback="ctrl+g"
              description={`edit in ${toIDEDisplayName(editor)}`}
            />
          </Text>
        ),
        priority: 'immediate',
        timeoutMs: 5000,
      });
    } else {
      removeNotification('external-editor-hint');
    }
  }, [shouldShowExternalEditorHint, editor, addNotification, removeNotification]);

  return (
    <SentryErrorBoundary>
      <Box flexDirection="column" alignItems={isNarrow ? 'flex-start' : 'flex-end'} flexShrink={0} overflowX="hidden">
        <NotificationContent
          ideSelection={ideSelection}
          mcpClients={mcpClients}
          notifications={notifications}
          isInOverageMode={isInOverageMode ?? false}
          isTeamOrEnterprise={isTeamOrEnterprise}
          apiKeyStatus={apiKeyStatus}
          debug={debug}
          verbose={verbose}
          tokenUsage={tokenUsage}
          mainLoopModel={mainLoopModel}
        />
      </Box>
    </SentryErrorBoundary>
  );
}

function NotificationContent({
  ideSelection,
  mcpClients,
  notifications,
  isInOverageMode,
  isTeamOrEnterprise,
  apiKeyStatus,
  debug,
  verbose,
  tokenUsage,
  mainLoopModel,
}: {
  ideSelection: IDESelection | undefined;
  mcpClients?: MCPServerConnection[];
  notifications: {
    current: Notification | null;
    queue: Notification[];
  };
  isInOverageMode: boolean;
  isTeamOrEnterprise: boolean;
  apiKeyStatus: VerificationStatus;
  debug: boolean;
  verbose: boolean;
  tokenUsage: number;
  mainLoopModel: string;
}): ReactNode {
  // Poll apiKeyHelper inflight state to show slow-helper notice.
  // Gated on configuration — most users never set apiKeyHelper, so the
  // effect is a no-op for them (no interval allocated).
  const [apiKeyHelperSlow, setApiKeyHelperSlow] = useState<string | null>(null);
  useEffect(() => {
    if (!getConfiguredApiKeyHelper()) return;
    const interval = setInterval(
      (setSlow: React.Dispatch<React.SetStateAction<string | null>>) => {
        const ms = getApiKeyHelperElapsedMs();
        const next = ms >= 10_000 ? formatDuration(ms) : null;
        setSlow(prev => (next === prev ? prev : next));
      },
      1000,
      setApiKeyHelperSlow,
    );
    return () => clearInterval(interval);
  }, []);

  // Voice state (VOICE_MODE builds only, runtime-gated by GrowthBook)
  const voiceStateRaw = useVoiceState(s => s.voiceState);
  const voiceState = feature('VOICE_MODE') ? voiceStateRaw : ('idle' as const);
  const voiceEnabledRaw = useVoiceEnabled();
  const voiceEnabled = feature('VOICE_MODE') ? voiceEnabledRaw : false;
  const voiceErrorRaw = useVoiceState(s => s.voiceError);
  const voiceError = feature('VOICE_MODE') ? voiceErrorRaw : null;
  const isBriefOnlyState = useAppState(s => s.isBriefOnly);
  const isBriefOnly = feature('KAIROS') || feature('KAIROS_BRIEF') ? isBriefOnlyState : false;

  // When voice is actively recording or processing, replace all
  // notifications with just the voice indicator.
  if (feature('VOICE_MODE') && voiceEnabled && (voiceState === 'recording' || voiceState === 'processing')) {
    return <VoiceIndicator voiceState={voiceState} />;
  }

  return (
    <>
      <IdeStatusIndicator ideSelection={ideSelection} mcpClients={mcpClients} />
      {notifications.current &&
        ('jsx' in notifications.current ? (
          <Text wrap="truncate" key={notifications.current.key}>
            {notifications.current.jsx}
          </Text>
        ) : (
          <Text color={notifications.current.color} dimColor={!notifications.current.color} wrap="truncate">
            {notifications.current.text}
          </Text>
        ))}
      {isInOverageMode && !isTeamOrEnterprise && (
        <Box>
          <Text dimColor wrap="truncate">
            Now using extra usage
          </Text>
        </Box>
      )}
      {apiKeyHelperSlow && (
        <Box>
          <Text color="warning" wrap="truncate">
            apiKeyHelper is taking a while{' '}
          </Text>
          <Text dimColor wrap="truncate">
            ({apiKeyHelperSlow})
          </Text>
        </Box>
      )}
      {(apiKeyStatus === 'invalid' || apiKeyStatus === 'missing') && (
        <Box>
          <Text color="error" wrap="truncate">
            {isEnvTruthy(process.env.CLAUDE_CODE_REMOTE)
              ? 'Authentication error · Try again'
              : 'Not logged in · Run /login'}
          </Text>
        </Box>
      )}
      {debug && (
        <Box>
          <Text color="warning" wrap="truncate">
            Debug mode
          </Text>
        </Box>
      )}
      {apiKeyStatus !== 'invalid' && apiKeyStatus !== 'missing' && verbose && (
        <Box>
          <Text dimColor wrap="truncate">
            {tokenUsage} tokens
          </Text>
        </Box>
      )}
      {!isBriefOnly && <TokenWarning tokenUsage={tokenUsage} model={mainLoopModel} />}
      {feature('VOICE_MODE')
        ? voiceEnabled &&
          voiceError && (
            <Box>
              <Text color="error" wrap="truncate">
                {voiceError}
              </Text>
            </Box>
          )
        : null}
      <MemoryUsageIndicator />
      <SandboxPromptFooterHint />
    </>
  );
}
