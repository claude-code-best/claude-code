import React, { useEffect, useState } from 'react';
import { formatCost } from '../cost-tracker.js';
import { Box, Text, ProgressBar } from '@anthropic/ink';
import { formatTokens } from '../utils/format.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';

type RateLimitBucket = {
  utilization: number;
  resets_at: number;
};

type BuiltinStatusLineProps = {
  modelName: string;
  contextUsedPct: number;
  usedTokens: number;
  contextWindowSize: number;
  totalCostUsd: number;
  rateLimits: {
    five_hour?: RateLimitBucket;
    seven_day?: RateLimitBucket;
  };
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

function BuiltinStatusLineInner({
  modelName,
  contextUsedPct,
  usedTokens,
  contextWindowSize,
  totalCostUsd,
  rateLimits,
}: BuiltinStatusLineProps) {
  const { columns } = useTerminalSize();

  // Force re-render every 60s so countdowns stay current
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const hasResetTime = (rateLimits.five_hour?.resets_at ?? 0) || (rateLimits.seven_day?.resets_at ?? 0);
    if (!hasResetTime) return;
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, [rateLimits.five_hour?.resets_at, rateLimits.seven_day?.resets_at]);

  // Suppress unused-variable lint for tick (it exists only to trigger re-renders)
  void tick;

  // Model display: use first two words (e.g. "Opus 4.6") instead of just first word
  const modelParts = modelName.split(' ');
  const shortModel = modelParts.length >= 2 ? `${modelParts[0]} ${modelParts[1]}` : modelName;

  const wide = columns >= 100;
  const narrow = columns < 60;

  const hasFiveHour = rateLimits.five_hour != null;
  const hasSevenDay = rateLimits.seven_day != null;

  const fiveHourPct = hasFiveHour ? Math.round(rateLimits.five_hour!.utilization * 100) : 0;
  const sevenDayPct = hasSevenDay ? Math.round(rateLimits.seven_day!.utilization * 100) : 0;

  // Token display: "50k/1M"
  const tokenDisplay = `${formatTokens(usedTokens)}/${formatTokens(contextWindowSize)}`;

  return (
    <Box>
      {/* Model name */}
      <Text>{shortModel}</Text>

      {/* Context usage with token counts */}
      <Separator />
      <Text dimColor>Context </Text>
      <Text>{contextUsedPct}%</Text>
      {!narrow && <Text dimColor> ({tokenDisplay})</Text>}

      {/* 5-hour session rate limit */}
      {hasFiveHour && (
        <>
          <Separator />
          <Text dimColor>Session </Text>
          {wide && (
            <>
              <ProgressBar
                ratio={rateLimits.five_hour!.utilization}
                width={10}
                fillColor="rate_limit_fill"
                emptyColor="rate_limit_empty"
              />
              <Text> </Text>
            </>
          )}
          <Text>{fiveHourPct}%</Text>
          {!narrow && rateLimits.five_hour!.resets_at > 0 && (
            <Text dimColor> {formatCountdown(rateLimits.five_hour!.resets_at)}</Text>
          )}
        </>
      )}

      {/* 7-day weekly rate limit */}
      {hasSevenDay && (
        <>
          <Separator />
          <Text dimColor>Weekly </Text>
          {wide && (
            <>
              <ProgressBar
                ratio={rateLimits.seven_day!.utilization}
                width={10}
                fillColor="rate_limit_fill"
                emptyColor="rate_limit_empty"
              />
              <Text> </Text>
            </>
          )}
          <Text>{sevenDayPct}%</Text>
          {!narrow && rateLimits.seven_day!.resets_at > 0 && (
            <Text dimColor> {formatCountdown(rateLimits.seven_day!.resets_at)}</Text>
          )}
        </>
      )}

      {/* Cost */}
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
