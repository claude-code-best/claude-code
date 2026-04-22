import { feature } from 'bun:bundle';
import * as React from 'react';
import { memo, useEffect, useState } from 'react';
import { useAppState } from 'src/state/AppState.js';
import { getSdkBetas, getKairosActive } from '../bootstrap/state.js';
import { getTotalCost, getTotalInputTokens, getTotalOutputTokens } from '../cost-tracker.js';
import { useMainLoopModel } from '../hooks/useMainLoopModel.js';
import { type ReadonlySettings } from '../hooks/useSettings.js';
import type { Message } from '../types/message.js';
import { calculateContextPercentages, getContextWindowForModel } from '../utils/context.js';
import { getLastAssistantMessage } from '../utils/messages.js';
import { getRuntimeMainLoopModel, renderModelName } from '../utils/model/model.js';
import { doesMostRecentAssistantMessageExceed200k, getCurrentUsage } from '../utils/tokens.js';
import { BuiltinStatusLine } from './BuiltinStatusLine.js';
import { getProviderUsage, subscribeProviderUsage } from '../services/providerUsage/store.js';
import type { ProviderUsage } from '../services/providerUsage/types.js';

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

  const [usage, setUsage] = useState<ProviderUsage>(getProviderUsage);
  useEffect(() => subscribeProviderUsage(setUsage), []);

  const messages = messagesRef.current ?? [];

  const exceeds200kTokens = lastAssistantMessageId ? doesMostRecentAssistantMessageExceed200k(messages) : false;

  const runtimeModel = getRuntimeMainLoopModel({
    permissionMode,
    mainLoopModel,
    exceeds200kTokens,
  });
  const modelDisplay = renderModelName(runtimeModel);
  const currentUsage = getCurrentUsage(messages);
  const contextWindowSize = getContextWindowForModel(runtimeModel, getSdkBetas());
  const contextPercentages = calculateContextPercentages(currentUsage, contextWindowSize);
  const totalCost = getTotalCost();
  const usedTokens = getTotalInputTokens() + getTotalOutputTokens();

  return (
    <BuiltinStatusLine
      modelName={modelDisplay}
      contextUsedPct={contextPercentages.used ?? 0}
      usedTokens={usedTokens}
      contextWindowSize={contextWindowSize}
      totalCostUsd={totalCost}
      buckets={usage.buckets}
      balance={usage.balance}
    />
  );
}

export const StatusLine = memo(StatusLineInner);
