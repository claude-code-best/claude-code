import { feature } from 'bun:bundle';
import * as React from 'react';
import { memo } from 'react';
import { useAppState } from 'src/state/AppState.js';
import { getSdkBetas, getKairosActive } from '../bootstrap/state.js';
import { getTotalCost, getTotalInputTokens, getTotalOutputTokens } from '../cost-tracker.js';
import { useMainLoopModel } from '../hooks/useMainLoopModel.js';
import { type ReadonlySettings } from '../hooks/useSettings.js';
import { getRawUtilization } from '../services/claudeAiLimits.js';
import type { Message } from '../types/message.js';
import { calculateContextPercentages, getContextWindowForModel } from '../utils/context.js';
import { getLastAssistantMessage } from '../utils/messages.js';
import { getRuntimeMainLoopModel, renderModelName } from '../utils/model/model.js';
import { doesMostRecentAssistantMessageExceed200k, getCurrentUsage } from '../utils/tokens.js';
import { BuiltinStatusLine } from './BuiltinStatusLine.js';

export function statusLineShouldDisplay(settings: ReadonlySettings): boolean {
  if (feature('KAIROS') && getKairosActive()) return false;
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
  const usedTokens = getTotalInputTokens() + getTotalOutputTokens();

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
