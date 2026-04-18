import React, { useEffect, useState } from 'react';
import { formatCost } from '../cost-tracker.js';
import { Box, Text, ProgressBar } from '@anthropic/ink';
import { formatTokens } from '../utils/format.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import type { ProviderBalance, ProviderUsageBucket } from '../services/providerUsage/types.js';

type BuiltinStatusLineProps = {
  modelName: string;
  contextUsedPct: number;
  usedTokens: number;
  contextWindowSize: number;
  totalCostUsd: number;
  buckets: ProviderUsageBucket[];
  balance?: ProviderBalance;
};

/**
 * Format a countdown from now until the given epoch time (in seconds).
 * Returns a compact human-readable string like "3h12m", "5d20h", "45m", or "now".
 */
export function formatCountdown(epochSeconds: number): string {
  const diff = epochSeconds - Date.now() / 1000;
  if (diff <= 0) return 'now';

  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);

  if (days >= 1) return `${days}d${hours}h`;
  if (hours >= 1) return `${hours}h${minutes}m`;
  return `${minutes}m`;
}

function Separator() {
  return <Text dimColor>{' \u2502 '}</Text>;
}

function hasAnyReset(buckets: ProviderUsageBucket[]): boolean {
  return buckets.some(b => (b.resetsAt ?? 0) > 0);
}

function formatBalance(balance: ProviderBalance): string {
  const isUsd = balance.currency === 'USD';
  const val = balance.remaining;
  // Two decimals for fiat, up to 4 for crypto-ish or small values
  const digits = Math.abs(val) >= 1 ? 2 : 4;
  return `${isUsd ? '$' : ''}${val.toFixed(digits)}${isUsd ? '' : ` ${balance.currency}`}`;
}

function BuiltinStatusLineInner({
  modelName,
  contextUsedPct,
  usedTokens,
  contextWindowSize,
  totalCostUsd,
  buckets,
  balance,
}: BuiltinStatusLineProps) {
  const { columns } = useTerminalSize();

  // Force re-render every 60s so bucket countdowns stay current.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!hasAnyReset(buckets)) return;
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, [buckets]);
  void tick;

  // Trust renderModelName() upstream. Previous two-word slice mangled ids like
  // "gpt-4o-2024-11-20" and "gemini-2.5-pro".
  const shortModel = modelName;

  const wide = columns >= 100;
  const narrow = columns < 60;

  const tokenDisplay = `${formatTokens(usedTokens)}/${formatTokens(contextWindowSize)}`;

  return (
    <Box>
      <Text wrap="truncate-end">{shortModel}</Text>

      <Separator />
      <Text dimColor>Context </Text>
      <Text>{contextUsedPct}%</Text>
      {!narrow && <Text dimColor> ({tokenDisplay})</Text>}

      {buckets.map(bucket => {
        const pct = Math.round(bucket.utilization * 100);
        return (
          <React.Fragment key={`${bucket.kind}-${bucket.label}`}>
            <Separator />
            <Text dimColor>{bucket.label} </Text>
            {wide && (
              <>
                <ProgressBar
                  ratio={bucket.utilization}
                  width={10}
                  fillColor="rate_limit_fill"
                  emptyColor="rate_limit_empty"
                />
                <Text> </Text>
              </>
            )}
            <Text>{pct}%</Text>
            {!narrow && bucket.resetsAt !== undefined && bucket.resetsAt > 0 && (
              <Text dimColor> {formatCountdown(bucket.resetsAt)}</Text>
            )}
          </React.Fragment>
        );
      })}

      {balance && (
        <>
          <Separator />
          <Text dimColor>Balance </Text>
          <Text>{formatBalance(balance)}</Text>
        </>
      )}

      {/* Cost is always displayed when > 0, even for subscription users who want
          to track notional consumption. */}
      {totalCostUsd > 0 && (
        <>
          <Separator />
          <Text>{formatCost(totalCostUsd)}</Text>
        </>
      )}
    </Box>
  );
}

export const BuiltinStatusLine = React.memo(BuiltinStatusLineInner);
