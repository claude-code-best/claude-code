import { feature } from 'bun:bundle';
import figures from 'figures';
import React, { useEffect, useRef, useState } from 'react';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { Box, Text, stringWidth } from '@anthropic/ink';
import { useAppState, useSetAppState } from '../state/AppState.js';
import type { AppState } from '../state/AppStateStore.js';
import { getGlobalConfig } from '../utils/config.js';
import { isFullscreenActive } from '../utils/fullscreen.js';
import {
  loadBuddyData,
  getActiveCreature,
  getCreatureName,
  getXpProgress,
  loadSprite,
  fetchAndCacheSprite,
  getFallbackSprite,
  renderAnimatedSprite,
  getIdleAnimMode,
  getSpeciesData,
  type Creature,
  type AnimMode,
} from '@claude-code-best/pokemon';

const TICK_MS = 500;
const BUBBLE_SHOW = 20; // ticks → ~10s at 500ms
const FADE_WINDOW = 6; // last ~3s the bubble dims so you know it's about to go
const PET_BURST_MS = 2500; // how long hearts float after /buddy pet

// Module-level cache for sync access in render
let _cachedCreature: Creature | null = null;
let _cacheLoadPromise: Promise<void> | null = null;

function ensureCreatureCache(): void {
  if (_cachedCreature !== null || _cacheLoadPromise) return;
  _cacheLoadPromise = loadBuddyData().then(data => {
    _cachedCreature = getActiveCreature(data);
    _cacheLoadPromise = null;
  }).catch(() => { _cacheLoadPromise = null; });
}

// Hearts float up-and-out over 5 ticks (~2.5s). Prepended above the sprite.
const H = figures.heart;
const PET_HEARTS = [
  `   ${H}    ${H}   `,
  `  ${H}  ${H}   ${H}  `,
  ` ${H}   ${H}  ${H}   `,
  `${H}  ${H}      ${H} `,
  '·    ·   ·  ',
];

function wrap(text: string, width: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur.length + w.length + 1 > width && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = cur ? `${cur} ${w}` : w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function SpeechBubble({ text, fading }: { text: string; fading: boolean; tail: 'down' | 'right' }): React.ReactNode {
  const lines = wrap(text, 30);
  const borderColor = fading ? 'inactive' : 'claude';
  const bubble = (
    <Box flexDirection="column" borderStyle="round" borderColor={borderColor} paddingX={1} width={34}>
      {lines.map((l, i) => (
        <Text key={i} italic dimColor={!fading} color={fading ? 'inactive' : undefined}>
          {l}
        </Text>
      ))}
    </Box>
  );
  return (
    <Box flexDirection="row" alignItems="center">
      {bubble}
      <Text color={borderColor}>─</Text>
    </Box>
  );
}

// For fullscreen floating bubble
function FloatingBubble({ text, fading }: { text: string; fading: boolean }): React.ReactNode {
  const lines = wrap(text, 30);
  const borderColor = fading ? 'inactive' : 'claude';
  return (
    <Box flexDirection="column" alignItems="flex-end" marginRight={1}>
      <Box flexDirection="column" borderStyle="round" borderColor={borderColor} paddingX={1} width={34}>
        {lines.map((l, i) => (
          <Text key={i} italic dimColor={!fading} color={fading ? 'inactive' : undefined}>
            {l}
          </Text>
        ))}
      </Box>
      <Box flexDirection="column" alignItems="flex-end" paddingRight={6}>
        <Text color={borderColor}>╲ </Text>
        <Text color={borderColor}>╲</Text>
      </Box>
    </Box>
  );
}

export const MIN_COLS_FOR_FULL_SPRITE = 100;
const SPRITE_BODY_WIDTH = 12;
const NAME_ROW_PAD = 2;
const SPRITE_PADDING_X = 2;
const BUBBLE_WIDTH = 36;
const NARROW_QUIP_CAP = 24;

function spriteColWidth(nameWidth: number): number {
  return Math.max(SPRITE_BODY_WIDTH, nameWidth + NAME_ROW_PAD);
}

/**
 * Get active Pokémon creature from cache, or null if not loaded yet.
 * Triggers async load if cache is empty.
 */
function getPokemonCreature(): Creature | null {
  try {
    ensureCreatureCache();
    return _cachedCreature;
  } catch {
    return null;
  }
}

/**
 * Force-refresh the creature cache (call after data changes).
 */
export function refreshCreatureCache(): void {
  _cachedCreature = null;
  _cacheLoadPromise = null;
  ensureCreatureCache();
}

export function companionReservedColumns(terminalColumns: number, speaking: boolean): number {
  if (!feature('BUDDY')) return 0;
  const creature = getPokemonCreature();
  if (!creature || getGlobalConfig().companionMuted) return 0;
  if (terminalColumns < MIN_COLS_FOR_FULL_SPRITE) return 0;
  const name = getCreatureName(creature);
  const nameWidth = stringWidth(name);
  const bubble = speaking && !isFullscreenActive() ? BUBBLE_WIDTH : 0;
  // Without sprite art, only need name row width + padding + optional bubble
  return nameWidth + NAME_ROW_PAD + SPRITE_PADDING_X + bubble;
}

/**
 * Get sprite lines for a creature with animated mode applied.
 */
function getAnimatedSpriteLines(creature: Creature, tick: number, mode: AnimMode): string[] {
  const cached = loadSprite(creature.speciesId);
  const baseLines = cached?.lines ?? getFallbackSprite(creature.speciesId);
  return renderAnimatedSprite(baseLines, tick, mode);
}

export function CompanionSprite(): React.ReactNode {
  const reaction = useAppState(s => s.companionReaction);
  const petAt = useAppState(s => s.companionPetAt);
  const xpInfo = useAppState(s => s.companionXpInfo);
  const focused = useAppState(s => s.footerSelection === 'companion');
  // Subscribe to creature changes so we re-render immediately after switch
  const creatureChangedAt = useAppState(s => s.companionCreatureChangedAt);
  const setAppState = useSetAppState();
  const { columns } = useTerminalSize();
  const [tick, setTick] = useState(0);
  const [spriteTick, setSpriteTick] = useState(0);

  // Prefetch sprite when creature changes
  useEffect(() => {
    const c = getPokemonCreature();
    if (!c || loadSprite(c.speciesId)) return;
    fetchAndCacheSprite(c.speciesId).then(s => { if (s) setSpriteTick(t => t + 1) });
  }, [creatureChangedAt]);
  void spriteTick;
  const lastSpokeTick = useRef(0);
  const [{ petStartTick, forPetAt }, setPetStart] = useState({
    petStartTick: 0,
    forPetAt: petAt,
  });
  if (petAt !== forPetAt) {
    setPetStart({ petStartTick: tick, forPetAt: petAt });
  }

  useEffect(() => {
    const timer = setInterval(
      (setT: React.Dispatch<React.SetStateAction<number>>) => setT((t: number) => t + 1),
      TICK_MS,
      setTick,
    );
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!reaction) return;
    lastSpokeTick.current = tick;
    const timer = setTimeout(
      (setA: React.Dispatch<React.SetStateAction<AppState>>) =>
        setA((prev: AppState) =>
          prev.companionReaction === undefined ? prev : { ...prev, companionReaction: undefined },
        ),
      BUBBLE_SHOW * TICK_MS,
      setAppState,
    );
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reaction, setAppState]);

  if (!feature('BUDDY')) return null;
  const creature = getPokemonCreature();
  if (!creature || getGlobalConfig().companionMuted) return null;

  const species = getSpeciesData(creature.speciesId);
  const name = getCreatureName(creature);
  const color = creature.isShiny ? 'warning' : 'claude';
  const colWidth = spriteColWidth(stringWidth(name));

  const bubbleAge = reaction ? tick - lastSpokeTick.current : 0;
  const fading = reaction !== undefined && bubbleAge >= BUBBLE_SHOW - FADE_WINDOW;

  const petAge = petAt ? tick - petStartTick : Infinity;
  const petting = petAge * TICK_MS < PET_BURST_MS;

  // Narrow terminals: collapse to one-line face
  if (columns < MIN_COLS_FOR_FULL_SPRITE) {
    const quip =
      reaction && reaction.length > NARROW_QUIP_CAP ? reaction.slice(0, NARROW_QUIP_CAP - 1) + '…' : reaction;
    const label = quip ? `"${quip}"` : focused ? ` ${name} ` : name;
    const xpLabel = xpInfo
      ? xpInfo.leveledUp
        ? ` ↑Lv.${xpInfo.level}`
        : ` Lv.${xpInfo.level} +${xpInfo.xpGained}xp`
      : creature.level > 1
        ? ` Lv.${creature.level}`
        : '';
    return (
      <Box paddingX={1} alignSelf="flex-end">
        <Text>
          {petting && <Text color="autoAccept">{figures.heart} </Text>}
          <Text bold color={color}>
            {species.names.zh ?? species.name}
          </Text>{' '}
          <Text
            italic
            dimColor={!focused && !reaction}
            bold={focused}
            inverse={focused && !reaction}
            color={reaction ? (fading ? 'inactive' : color) : focused ? color : undefined}
          >
            {label}
          </Text>
          {xpLabel && (
            <Text dimColor bold={xpInfo?.leveledUp} color={xpInfo?.leveledUp ? 'warning' : 'inactive'}>
              {xpLabel}
            </Text>
          )}
        </Text>
      </Box>
    );
  }

  // Determine animation mode
  let animMode: AnimMode = 'idle';
  if (reaction || petting) {
    animMode = 'excited';
  } else {
    animMode = getIdleAnimMode(tick);
    if (petting) animMode = 'pet';
  }

  const spriteLines = getAnimatedSpriteLines(creature, tick, animMode);
  const heartFrame = petting ? PET_HEARTS[petAge % PET_HEARTS.length] : null;
  const displayLines = heartFrame ? [heartFrame, ...spriteLines] : spriteLines;

  const xpStatus = xpInfo
    ? xpInfo.leveledUp
      ? `↑Lv.${xpInfo.level}`
      : `+${xpInfo.xpGained}xp`
    : null;

  const spriteColumn = (
    <Box flexDirection="column" flexShrink={0} alignItems="center" width={colWidth}>
      <Text italic bold={focused} dimColor={!focused} color={focused ? color : undefined} inverse={focused}>
        {focused ? ` ${name} ` : name}
      </Text>
      <Text dimColor color={xpInfo?.leveledUp ? 'warning' : 'inactive'}>
        Lv.{creature.level} {xpStatus ?? ''}
      </Text>
    </Box>
  );

  if (!reaction) {
    return <Box paddingX={1}>{spriteColumn}</Box>;
  }

  if (isFullscreenActive()) {
    return <Box paddingX={1}>{spriteColumn}</Box>;
  }
  return (
    <Box flexDirection="row" alignItems="flex-end" paddingX={1} flexShrink={0}>
      <SpeechBubble text={reaction} fading={fading} tail="right" />
      {spriteColumn}
    </Box>
  );
}

// Floating bubble overlay for fullscreen mode
export function CompanionFloatingBubble(): React.ReactNode {
  const reaction = useAppState(s => s.companionReaction);
  const _creatureChangedAt = useAppState(s => s.companionCreatureChangedAt);
  const [{ tick, forReaction }, setTick] = useState({
    tick: 0,
    forReaction: reaction,
  });

  if (reaction !== forReaction) {
    setTick({ tick: 0, forReaction: reaction });
  }

  useEffect(() => {
    if (!reaction) return;
    const timer = setInterval(
      (set: React.Dispatch<React.SetStateAction<{ tick: number; forReaction: string | undefined }>>) =>
        set(s => ({ ...s, tick: s.tick + 1 })),
      TICK_MS,
      setTick,
    );
    return () => clearInterval(timer);
  }, [reaction]);

  if (!feature('BUDDY') || !reaction) return null;
  const creature = getPokemonCreature();
  if (!creature || getGlobalConfig().companionMuted) return null;

  return <FloatingBubble text={reaction} fading={tick >= BUBBLE_SHOW - FADE_WINDOW} />;
}
