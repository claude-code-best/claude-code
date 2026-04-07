/**
 * Companion display card — shown by /buddy (no args).
 * Mirrors official vc8 component: bordered box with sprite, stats, last reaction.
 */
import React from 'react';
import { Box, Text } from '../ink.js';
import { useInput } from '../ink.js';
import { renderSprite } from './sprites.js';
import { RARITY_COLORS, RARITY_STARS, STAT_NAMES, type Companion } from './types.js';

const CARD_WIDTH = 40;
const CARD_PADDING_X = 2;

function StatBar({ name, value }: { name: string; value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const filled = Math.round(clamped / 10);
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(10 - filled);
  return (
    <Text>
      {name.padEnd(10)} {bar} {String(value).padStart(3)}
    </Text>
  );
}

export function CompanionCard({
  companion,
  lastReaction,
  onDone,
}: {
  companion: Companion;
  lastReaction?: string;
  onDone?: (result?: string, options?: { display?: string }) => void;
}) {
  const color = RARITY_COLORS[companion.rarity];
  const stars = RARITY_STARS[companion.rarity];
  const sprite = renderSprite(companion, 0);

  // Press any key to dismiss
  useInput(
    () => {
      onDone?.(undefined, { display: 'skip' });
    },
    { isActive: onDone !== undefined },
  );

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={color}
      paddingX={CARD_PADDING_X}
      paddingY={1}
      width={CARD_WIDTH}
      flexShrink={0}
    >
      {/* Header: rarity + species */}
      <Box justifyContent="space-between">
        <Text bold color={color}>
          {stars} {companion.rarity.toUpperCase()}
        </Text>
        <Text color={color}>{companion.species.toUpperCase()}</Text>
      </Box>

      {/* Shiny indicator */}
      {companion.shiny && (
        <Text color="warning" bold>
          {'\u2728'} SHINY {'\u2728'}
        </Text>
      )}

      {/* Sprite */}
      <Box flexDirection="column" marginY={1}>
        {sprite.map((line, i) => (
          <Text key={i} color={color}>
            {line}
          </Text>
        ))}
      </Box>

      {/* Name */}
      <Text bold>{companion.name}</Text>

      {/* Personality */}
      <Box marginY={1}>
        <Text dimColor italic>
          &quot;{companion.personality}&quot;
        </Text>
      </Box>

      {/* Stats */}
      <Box flexDirection="column">
        {STAT_NAMES.map(name => (
          <StatBar key={name} name={name} value={companion.stats[name] ?? 0} />
        ))}
      </Box>

      {/* Last reaction */}
      {lastReaction && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>last said</Text>
          <Box borderStyle="round" borderColor="inactive" paddingX={1}>
            <Text dimColor italic>
              {lastReaction}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
