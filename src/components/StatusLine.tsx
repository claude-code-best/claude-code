import * as React from 'react';
import { memo } from 'react';
import { getSdkBetas } from 'src/bootstrap/state.js';
import { getTotalCost } from 'src/cost-tracker.js';
import { useMainLoopModel } from 'src/hooks/useMainLoopModel.js';
import { type ReadonlySettings } from 'src/hooks/useSettings.js';
import { getRawUtilization } from 'src/services/claudeAiLimits.js';
import { useAppState } from 'src/state/AppState.js';
import type { Message } from 'src/types/message.js';
import { calculateContextPercentages, getContextWindowForModel } from 'src/utils/context.js';
import { getLastAssistantMessage } from 'src/utils/messages.js';
import { getRuntimeMainLoopModel, renderModelName } from 'src/utils/model/model.js';
import { doesMostRecentAssistantMessageExceed200k, getCurrentUsage } from 'src/utils/tokens.js';
import { BuiltinStatusLine } from 'src/components/BuiltinStatusLine.js';

export function statusLineShouldDisplay(_settings: ReadonlySettings): boolean {
  return true;
}

type Props = {
  messagesRef: React.RefObject<Message[]>;
  lastAssistantMessageId: string | null;
  vimMode?: unknown;
};

export function getLastAssistantMessageId(messages: Message[]): string | null {
  return getLastAssistantMessage(messages)?.uuid ?? null;
}

function StatusLineInner({ messagesRef, lastAssistantMessageId }: Props): React.ReactNode {
  const mainLoopModel = useMainLoopModel();
  const permissionMode = useAppState(s => s.toolPermissionContext.mode);

  const exceeds200kTokens = lastAssistantMessageId
    ? doesMostRecentAssistantMessageExceed200k(messagesRef.current)
    : false;

  const runtimeModel = getRuntimeMainLoopModel({ permissionMode, mainLoopModel, exceeds200kTokens });
  const modelDisplay = renderModelName(runtimeModel);
  const currentUsage = getCurrentUsage(messagesRef.current);
  const contextWindowSize = getContextWindowForModel(runtimeModel, getSdkBetas());
  const contextPercentages = calculateContextPercentages(currentUsage, contextWindowSize);
  const rawUtil = getRawUtilization();
  const totalCost = getTotalCost();
  // Derive usedTokens from currentUsage (same source as contextUsedPct) for consistency
  const usedTokens = currentUsage
    ? currentUsage.input_tokens +
      currentUsage.output_tokens +
      currentUsage.cache_creation_input_tokens +
      currentUsage.cache_read_input_tokens
    : 0;

  return (
    <BuiltinStatusLine
      modelName={modelDisplay}
      contextUsedPct={contextPercentages.used}
      usedTokens={usedTokens}
      contextWindowSize={contextWindowSize}
      totalCostUsd={totalCost}
      rateLimits={rawUtil}
    />
  );
}

export const StatusLine = memo(StatusLineInner);
