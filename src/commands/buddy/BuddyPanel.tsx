import * as React from 'react';
import { useState } from 'react';
import { Box, Text, Pane, Tab, Tabs, useInput, type Color } from '@anthropic/ink';
import { useSetAppState } from '../../state/AppState.js';
import { useKeybinding } from '../../keybindings/useKeybinding.js';
import { useExitOnCtrlCDWithKeybindings } from '../../hooks/useExitOnCtrlCDWithKeybindings.js';
import {
  STAT_NAMES,
  STAT_LABELS,
  ALL_SPECIES_IDS,
  type BuddyData,
  type Creature,
  type SpeciesId,
} from '@claude-code-best/pokemon';
import { getSpeciesData, ensureSpeciesData } from '@claude-code-best/pokemon';

import { getNextEvolution } from '@claude-code-best/pokemon';
import { calculateStats, getCreatureName, getTotalEV, getActiveCreature, saveBuddyData, EGG_REQUIRED_DAYS, addToParty, swapPartySlots, removeFromParty, compactParty } from '@claude-code-best/pokemon';
import { getXpProgress } from '@claude-code-best/pokemon';

import { getGenderSymbol } from '@claude-code-best/pokemon';
import { StatBar, SpriteAnimator, getFallbackSprite, loadSprite, fetchAndCacheSprite, SpeciesPicker } from '@claude-code-best/pokemon';
import type { LocalJSXCommandOnDone } from '../../types/command.js';

const CYAN: Color = 'ansi:cyan';
const YELLOW: Color = 'ansi:yellow';
const GREEN: Color = 'ansi:green';
const BLUE: Color = 'ansi:blue';
const RED: Color = 'ansi:red';
const MAGENTA: Color = 'ansi:magenta';
const WHITE: Color = 'ansi:whiteBright';
const GRAY: Color = 'ansi:white';

const TYPE_COLORS: Record<string, Color> = {
  grass: 'ansi:green',
  poison: 'ansi:magenta',
  fire: 'ansi:red',
  flying: 'ansi:cyan',
  water: 'ansi:blue',
  electric: 'ansi:yellow',
  normal: 'ansi:white',
};

interface BuddyPanelProps {
  buddyData: BuddyData;
  spriteLines?: string[];
  onClose: LocalJSXCommandOnDone;
}

/**
 * Unified buddy panel with tabs — same pattern as Settings.
 * ESC closes, ←/→ switch tabs, Ctrl+C/D double-press exits.
 */
export function BuddyPanel({ buddyData, spriteLines, onClose }: BuddyPanelProps) {
  const [selectedTab, setSelectedTab] = useState('Buddy');
  const [data, setData] = useState(buddyData);
  const setAppState = useSetAppState();

  useExitOnCtrlCDWithKeybindings();

  // Trigger species data refresh from API (fire-and-forget)
  React.useEffect(() => {
    ensureSpeciesData();
  }, []);

  const handleEscape = () => {
    onClose('buddy panel closed');
  };

  useKeybinding('confirm:no', handleEscape, {
    context: 'Settings',
    isActive: true,
  });

  // Tab / Shift+Tab to switch between tabs
  const TAB_ORDER = ['Buddy', 'PC Box', 'Pokédex', 'Egg']
  useInput((_input, key) => {
    if (key.tab) {
      setSelectedTab(prev => {
        const idx = TAB_ORDER.indexOf(prev)
        if (key.shift) {
          return TAB_ORDER[(idx - 1 + TAB_ORDER.length) % TAB_ORDER.length]!
        }
        return TAB_ORDER[(idx + 1) % TAB_ORDER.length]!
      })
    }
  });

  const updateData = (updated: BuddyData) => {
    setData(updated);
    saveBuddyData(updated);
    setAppState(prev => ({ ...prev, companionCreatureChangedAt: Date.now() }));
  };

  const tabs = [
    <Tab key="buddy" title="Buddy">
      <PartyView data={data} onUpdate={updateData} isActive={selectedTab === 'Buddy'} />
    </Tab>,
    <Tab key="pc" title="PC Box">
      <PcBoxTab data={data} onUpdate={updateData} isActive={selectedTab === 'PC Box'} />
    </Tab>,
    <Tab key="dex" title="Pokédex">
      <DexTab
        buddyData={data}
        isActive={selectedTab === 'Pokédex'}
        onUpdate={updateData}
        onClose={() => onClose('buddy panel closed')}
      />
    </Tab>,
    <Tab key="egg" title="Egg">
      <EggTab buddyData={data} />
    </Tab>,
  ];

  return (
    <Pane color="permission">
      <Tabs color="permission" selectedTab={selectedTab} onTabChange={setSelectedTab} disableNavigation={true}>
        {tabs}
      </Tabs>
    </Pane>
  );
}

// ─── Party View (replaces BuddyTab) ─────────────────────

function PartyView({
  data,
  onUpdate,
  isActive,
}: {
  data: BuddyData;
  onUpdate: (data: BuddyData) => void;
  spriteLines?: string[];
  isActive: boolean;
}) {
  const [focusedSlot, setFocusedSlot] = useState(0);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [tick, setTick] = useState(0); // force re-render on navigation
  const [spriteTick, setSpriteTick] = useState(0); // force re-render after sprite fetch

  useInput((_input, key) => {
    if (!isActive) return;
    if (key.leftArrow) {
      setFocusedSlot(prev => (prev > 0 ? prev - 1 : 5));
      setTick(t => t + 1);
      setStatusMsg(null);
    } else if (key.rightArrow) {
      setFocusedSlot(prev => (prev < 5 ? prev + 1 : 0));
      setTick(t => t + 1);
      setStatusMsg(null);
    } else if (key.return) {
      if (focusedSlot === 0) {
        setStatusMsg('This is your active buddy!');
        return;
      }
      const updated = swapPartySlots(data, 0, focusedSlot);
      onUpdate(updated);
      setStatusMsg('Swapped with active buddy!');
    } else if (_input === 'x' || _input === 'X') {
      const creatureId = data.party[focusedSlot];
      if (!creatureId) return;
      const updated = removeFromParty(data, focusedSlot);
      onUpdate(updated);
      setStatusMsg('Removed from party.');
    }
  });

  // Resolve creature for the focused slot (tick forces re-read)
  const _tick = tick; // reference tick to avoid unused warning
  const focusedCreatureId = data.party[focusedSlot];
  const focusedCreature = focusedCreatureId
    ? data.creatures.find(c => c.id === focusedCreatureId) ?? null
    : null;

  // Async-fetch sprite for focused creature if not cached
  React.useEffect(() => {
    if (!focusedCreature) return;
    if (loadSprite(focusedCreature.speciesId)) return;
    fetchAndCacheSprite(focusedCreature.speciesId).then((sprite) => {
      if (sprite) setSpriteTick(t => t + 1);
    });
  }, [focusedCreature?.speciesId]);

  // Also prefetch sprites for all party members on mount
  React.useEffect(() => {
    for (const id of data.party) {
      if (!id) continue;
      const c = data.creatures.find(cr => cr.id === id);
      if (c && !loadSprite(c.speciesId)) {
        fetchAndCacheSprite(c.speciesId).then((sprite) => {
          if (sprite) setSpriteTick(t => t + 1);
        });
      }
    }
  }, []);

  // Consume spriteTick to avoid unused warning
  void spriteTick;

  // Load sprite for focused creature (not just active)
  const focusedSprite = focusedCreature
    ? (loadSprite(focusedCreature.speciesId)?.lines ?? getFallbackSprite(focusedCreature.speciesId))
    : undefined;

  return (
    <Box flexDirection="column">
      {/* Party slots row */}
      <Box flexDirection="row" justifyContent="center">
        {data.party.map((creatureId, i) => {
          const creature = creatureId ? data.creatures.find(c => c.id === creatureId) : null;
          const isActiveSlot = i === 0;
          const isFocused = i === focusedSlot;

          return (
            <Box key={i} flexDirection="column" alignItems="center" width={14} marginX={0}>
              <Box borderStyle={isFocused ? 'round' : undefined} borderColor={isFocused ? CYAN : undefined} paddingX={1}>
                <Text>
                  {isActiveSlot && !isFocused && <Text color={YELLOW}>★</Text>}
                  {isFocused && <Text color={CYAN}>▸</Text>}
                  {creature ? (
                    <Text bold={isFocused} color={isFocused ? CYAN : GRAY}>
                      {getCreatureName(creature).length > 8
                        ? getCreatureName(creature).slice(0, 7) + '…'
                        : getCreatureName(creature)}
                    </Text>
                  ) : (
                    <Text color={GRAY}>---</Text>
                  )}
                </Text>
              </Box>
              <Text color={creature ? GRAY : undefined} dimColor={!creature}>
                {creature ? `Lv.${creature.level}` : '   '}
              </Text>
            </Box>
          );
        })}
      </Box>

      {/* Status message */}
      {statusMsg && (
        <Box justifyContent="center">
          <Text color={GRAY} italic>{statusMsg}</Text>
        </Box>
      )}

      {/* Hint */}
      <Box justifyContent="center">
        <Text color={GRAY} dimColor>←/→ navigate · Enter swap · X remove</Text>
      </Box>

      {/* Selected creature detail — key forces remount on slot change */}
      {focusedCreature ? (
        <CreatureDetail key={focusedCreature.id} creature={focusedCreature} spriteLines={focusedSprite} isActive={data.party[0] === focusedCreature.id} />
      ) : (
        <Box flexDirection="column" alignItems="center" marginTop={1}>
          <Text color={GRAY} italic>Empty slot — add from Pokédex tab</Text>
        </Box>
      )}
    </Box>
  );
}

// ─── Creature Detail ─────────────────────────────────────

function CreatureDetail({
  creature,
  spriteLines,
  isActive,
}: {
  creature: Creature;
  spriteLines?: string[];
  isActive: boolean;
}) {
  const species = getSpeciesData(creature.speciesId);
  const stats = calculateStats(creature);
  const xp = getXpProgress(creature);
  const genderSymbol = getGenderSymbol(creature.gender);
  const name = getCreatureName(creature);
  const totalEV = getTotalEV(creature);
  const nextEvo = getNextEvolution(creature.speciesId);

  const typeBadges = species.types
    .filter((t): t is string => Boolean(t))
    .map((t, i) => (
      <React.Fragment key={t}>
        {i > 0 && <Text color={GRAY}>/</Text>}
        <Text color={TYPE_COLORS[t] ?? GRAY}>{t.toUpperCase()}</Text>
      </React.Fragment>
    ));

  const friendshipColor: Color = creature.friendship > 200 ? GREEN : creature.friendship > 100 ? YELLOW : RED;
  const shinyBadge = creature.isShiny ? <Text color={YELLOW}> ★SHINY★</Text> : null;
  const evoHint = nextEvo ? (
    <Text color={GRAY}>
      {' '}
      → <Text color={CYAN}>{getSpeciesData(nextEvo.to).name}</Text> Lv.
      {nextEvo.minLevel}
    </Text>
  ) : null;

  return (
    <Box flexDirection="column" alignItems="center">
      <Box>
        <Text bold color={CYAN}>
          {name}
        </Text>
        <Text color={GRAY}> #{String(species.dexNumber).padStart(3, '0')}</Text>
        {shinyBadge}
        <Text bold> Lv.{creature.level}</Text>
        {isActive && <Text color={YELLOW}> ★ Active</Text>}
      </Box>

      <Box>
        <Text color={GRAY}>{species.name}</Text>
        <Text> </Text>
        {typeBadges}
        {genderSymbol && <Text> {genderSymbol}</Text>}
      </Box>

      {spriteLines && (
        <Box marginY={0}>
          <SpriteAnimator
            lines={spriteLines}
            color={creature.isShiny ? YELLOW : CYAN}
            tickMs={500}
          />
        </Box>
      )}

      {species.flavorText && (
        <Box>
          <Text color={GRAY} italic>
            "{species.flavorText}"
          </Text>
        </Box>
      )}

      <Box flexDirection="column" marginTop={0}>
        <Box>
          <Box width={28}>
            <Text color={GRAY}>─── Stats ───</Text>
          </Box>
          <Box>
            <Text color={GRAY}>─── Base ───</Text>
          </Box>
        </Box>
        {STAT_NAMES.map(stat => {
          const baseVal = species.baseStats[stat];
          const baseFilled = Math.round((baseVal / 130) * 12);
          const ev = creature.ev[stat];
          const evText = ev > 0 ? <Text color={GREEN}>({ev})</Text> : null;
          return (
            <Box key={stat}>
              <Box width={28}>
                <StatBar label={STAT_LABELS[stat]} value={stats[stat]} maxValue={255} color={getStatColor(stat)} />
                {evText}
              </Box>
              <Box>
                <Text color={WHITE}>{STAT_LABELS[stat].padEnd(3)}</Text>
                <Text color={getStatColor(stat)}>
                  {'█'.repeat(baseFilled)}
                  {'░'.repeat(12 - baseFilled)}
                </Text>
                <Text> {String(baseVal).padStart(3)}</Text>
              </Box>
            </Box>
          );
        })}
      </Box>

      <Box marginTop={0}>
        <Text color={GRAY}>XP </Text>
        <Text color={BLUE}>
          {'█'.repeat(Math.round(xp.percentage / 10))}
          {'░'.repeat(10 - Math.round(xp.percentage / 10))}
        </Text>
        <Text>
          {' '}
          {xp.current}/{xp.needed}
        </Text>
      </Box>

      <Box flexDirection="column" alignItems="center">
        <Box>
          <Text color={GRAY}>EV </Text>
          <Text color={totalEV >= 510 ? GREEN : GRAY}>{totalEV}/510</Text>
        </Box>
        <Box>
          <Text color={GRAY}>♥ </Text>
          <Text color={friendshipColor}>
            {'█'.repeat(Math.round((creature.friendship / 255) * 10))}
            {'░'.repeat(10 - Math.round((creature.friendship / 255) * 10))}
          </Text>
          <Text> {creature.friendship}/255</Text>
        </Box>
      </Box>

      {evoHint && (
        <Box marginTop={0}>
          <Text color={GRAY}>Next: </Text>
          {evoHint}
        </Box>
      )}
    </Box>
  );
}

// ─── Dex Tab ──────────────────────────────────────────

const BAR_WIDTH = 30
const MAX_VISIBLE_DEX = 15

const GEN_RANGES = [
  { label: 'Gen I',   start: 1,   end: 151 },
  { label: 'Gen II',  start: 152, end: 251 },
  { label: 'Gen III', start: 252, end: 386 },
  { label: 'Gen IV',  start: 387, end: 493 },
  { label: 'Gen V',   start: 494, end: 649 },
  { label: 'Gen VI',  start: 650, end: 721 },
  { label: 'Gen VII', start: 722, end: 809 },
  { label: 'Gen VIII',start: 810, end: 905 },
  { label: 'Gen IX',  start: 906, end: 1025 },
]

function DexTab({
  buddyData,
  isActive,
  onUpdate,
  onClose,
}: {
  buddyData: BuddyData;
  isActive: boolean;
  onUpdate: (data: BuddyData) => void;
  onClose: () => void;
}) {
  const dexMap = new Map(buddyData.dex.map(d => [d.speciesId, d]));
  const collected = buddyData.dex.length;
  const total = ALL_SPECIES_IDS.length;
  const percent = total > 0 ? collected / total : 0;
  const partySet = new Set(buddyData.party.filter((id): id is string => id !== null));

  const [mode, setMode] = useState<'stats' | 'search' | 'detail'>('stats');
  const [focusedId, setFocusedId] = useState<SpeciesId>(buddyData.dex[0]?.speciesId ?? 'bulbasaur');
  const [dexCursor, setDexCursor] = useState(0);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [dexSpriteTick, setDexSpriteTick] = useState(0);

  // Prefetch sprite for focused dex species
  React.useEffect(() => {
    if (!loadSprite(focusedId)) {
      fetchAndCacheSprite(focusedId).then(s => { if (s) setDexSpriteTick(t => t + 1) });
    }
  }, [focusedId]);
  void dexSpriteTick;

  // Sorted discovered species
  const discovered = buddyData.dex
    .slice()
    .sort((a, b) => getSpeciesData(a.speciesId).dexNumber - getSpeciesData(b.speciesId).dexNumber);

  // Per-gen stats
  const genStats = GEN_RANGES.map(g => {
    const genSpecies = ALL_SPECIES_IDS.filter(id => {
      const n = getSpeciesData(id).dexNumber
      return n >= g.start && n <= g.end
    })
    const collectedNums = new Set(buddyData.dex.map(e => getSpeciesData(e.speciesId).dexNumber))
    const genCollected = genSpecies.filter(id => collectedNums.has(getSpeciesData(id).dexNumber)).length
    return { ...g, total: genSpecies.length, collected: genCollected }
  })

  // Input handling for stats & detail modes
  useInput((_input, key) => {
    if (!isActive) return;
    if (mode === 'search') return; // SpeciesPicker handles its own input

    if (mode === 'stats') {
      if (_input.toLowerCase() === 's') {
        setMode('search');
        return;
      }
      if (key.upArrow) {
        setDexCursor(prev => Math.max(0, prev - 1));
        setStatusMsg(null);
        return;
      }
      if (key.downArrow) {
        setDexCursor(prev => Math.min(discovered.length - 1, prev + 1));
        setStatusMsg(null);
        return;
      }
      if (key.return && discovered.length > 0) {
        const entry = discovered[dexCursor];
        if (entry) {
          setFocusedId(entry.speciesId);
          setMode('detail');
          setStatusMsg(null);
        }
        return;
      }
      if (key.escape) {
        onClose();
        return;
      }
      return;
    }

    if (mode === 'detail') {
      if (_input.toLowerCase() === 's') {
        setMode('search');
        return;
      }
      if (key.escape) {
        setMode('stats');
        return;
      }
      if (key.return) {
        handleAddToParty(focusedId);
        return;
      }
    }
  });

  const handleAddToParty = (speciesId: SpeciesId) => {
    const creature = buddyData.creatures.find(c => c.speciesId === speciesId);
    if (!creature) return;
    if (partySet.has(creature.id)) {
      setStatusMsg('Already in party!');
      return;
    }
    const result = addToParty(buddyData, creature.id);
    if (result.added) {
      onUpdate(result.data);
      setStatusMsg(`Added ${getCreatureName(creature)} to party!`);
    } else {
      setStatusMsg('Party is full!');
    }
  };

  // ─── Search mode (SpeciesPicker) ───
  if (mode === 'search') {
    return (
      <SpeciesPicker
        onSelect={(speciesId) => {
          setFocusedId(speciesId);
          setMode('detail');
          setStatusMsg(null);
        }}
        onCancel={() => setMode('stats')}
        title="搜索精灵"
      />
    );
  }

  // ─── Detail mode ───
  if (mode === 'detail') {
    const species = getSpeciesData(focusedId);
    const entry = dexMap.get(focusedId);
    const discovered_ = !!entry;
    const owned = buddyData.creatures.find(c => c.speciesId === focusedId);
    const inParty = owned ? partySet.has(owned.id) : false;
    const sprite = discovered_ ? (loadSprite(focusedId)?.lines ?? getFallbackSprite(focusedId)) : null;
    const maxBase = 130;

    return (
      <Box flexDirection="column">
        <Box justifyContent="space-between">
          <Text bold color={CYAN}>Pokédex — Detail</Text>
          <Text color={GRAY}>{collected}/{total} {(percent * 100).toFixed(1)}%</Text>
        </Box>

        {/* Sprite (centered, full width) */}
        {discovered_ ? (
          <>
            {sprite && (
              <Box flexDirection="column" alignItems="center">
                {sprite.map((line, i) => <Text key={i} color={CYAN}>{line}</Text>)}
              </Box>
            )}
            <Box justifyContent="center">
              <Text bold color={CYAN}>#{String(species.dexNumber).padStart(3, '0')} </Text>
              <Text bold color={WHITE}>{species.name}</Text>
            </Box>
            <Box justifyContent="center">
              {species.types.filter((t): t is string => Boolean(t)).map((t, ti) => (
                <React.Fragment key={t}>
                  {ti > 0 && <Text color={GRAY}>/</Text>}
                  <Text color={TYPE_COLORS[t] ?? GRAY}>{t.toUpperCase()}</Text>
                </React.Fragment>
              ))}
              <Text color={GRAY}>  {getGenderInfoText(species.genderRate)}</Text>
            </Box>
            {/* Evolution chain */}
            {(() => {
              const chain = getChainFor(focusedId);
              if (chain.length <= 1) return null;
              return (
                <Box flexDirection="column">
                  <Text color={GRAY}>Evolution:</Text>
                  <Box>
                    {chain.map((sid, i) => {
                      const next = getNextEvolution(sid);
                      return (
                        <React.Fragment key={sid}>
                          {i > 0 && <Text color={GRAY}> → </Text>}
                          <Text color={sid === focusedId ? CYAN : GRAY} bold={sid === focusedId}>
                            {getSpeciesData(sid).name}
                          </Text>
                          {next && <Text color={GRAY}> Lv.{next.minLevel}</Text>}
                        </React.Fragment>
                      );
                    })}
                  </Box>
                </Box>
              );
            })()}
          </>
        ) : (
          <Box flexDirection="column" alignItems="center" marginTop={1}>
            <Text color={GRAY}>{'  ???  '}</Text>
            <Text color={GRAY}>{' /   \\'}</Text>
            <Text color={GRAY}>{' | ? |'}</Text>
            <Text color={GRAY}>{' \\_/'}</Text>
            <Text bold color={GRAY}>#{String(species.dexNumber).padStart(3, '0')} ???</Text>
            <Text color={GRAY} italic>Undiscovered species...</Text>
          </Box>
        )}

        {discovered_ && species.flavorText && (
          <Box>
            <Text color={GRAY} italic>"{species.flavorText}"</Text>
          </Box>
        )}

        {/* Bottom: base stats */}
        {discovered_ && (
          <Box flexDirection="column">
            <Text color={GRAY}>─── Base Stats ───</Text>
            {STAT_NAMES.map(stat => {
              const val = species.baseStats[stat];
              const filled = Math.round((val / maxBase) * 12);
              return (
                <Box key={stat}>
                  <Text color={WHITE}>{STAT_LABELS[stat].padEnd(3)}</Text>
                  <Text color={getStatColor(stat)}>
                    {'█'.repeat(filled)}{'░'.repeat(12 - filled)}
                  </Text>
                  <Text> {String(val).padStart(3)}</Text>
                </Box>
              );
            })}
            <Box>
              <Text color={WHITE}>{'Total'.padEnd(3)}</Text>
              <Text color={GRAY}>{'─'.repeat(12)}</Text>
              <Text bold> {Object.values(species.baseStats).reduce((a, b) => a + b, 0)}</Text>
            </Box>
          </Box>
        )}

        {/* Status */}
        <Box marginTop={0}>
          {statusMsg ? (
            <Text color={GREEN} italic>{statusMsg}</Text>
          ) : owned ? (
            inParty ? <Text color={GREEN}>★ In party</Text> : <Text color={CYAN}>[Enter] 加入队伍</Text>
          ) : (
            <Text color={GRAY}>Not owned</Text>
          )}
        </Box>
        <Box>
          <Text color={GRAY}>[S] 搜索 · [Esc] 返回列表</Text>
        </Box>
      </Box>
    );
  }

  // ─── Stats mode (default) ───
  // Visible window of discovered species
  const halfVis = Math.floor(MAX_VISIBLE_DEX / 2);
  let startIdx = dexCursor - halfVis;
  if (startIdx < 0) startIdx = 0;
  if (startIdx + MAX_VISIBLE_DEX > discovered.length) startIdx = Math.max(0, discovered.length - MAX_VISIBLE_DEX);
  const visibleDex = discovered.slice(startIdx, startIdx + MAX_VISIBLE_DEX);

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box justifyContent="space-between">
        <Text bold color={CYAN}>Pokédex</Text>
        <Text>
          <Text bold color={collected === total ? GREEN : WHITE}>{collected}</Text>
          <Text color={GRAY}>/{total} </Text>
          <Text bold color={GREEN}>{(percent * 100).toFixed(1)}%</Text>
        </Text>
      </Box>

      {/* Fixed-width progress bar */}
      <Box>
        <Text color={GREEN}>{'█'.repeat(Math.round(percent * BAR_WIDTH))}</Text>
        <Text color={GRAY}>{'░'.repeat(BAR_WIDTH - Math.round(percent * BAR_WIDTH))}</Text>
        <Text> {Math.floor(percent * 100)}%</Text>
      </Box>

      <Box flexDirection="row">
        {/* Left: discovered species list */}
        <Box flexDirection="column" width={24}>
          {discovered.length > 0 ? (
            <>
              {startIdx > 0 && <Text color={GRAY}>  ↑ more</Text>}
              {visibleDex.map((entry, vi) => {
                const actualIdx = startIdx + vi;
                const species = getSpeciesData(entry.speciesId);
                const inParty = buddyData.creatures.some(c => partySet.has(c.id) && c.speciesId === species.id);
                const isCursor = actualIdx === dexCursor;
                return (
                  <Box key={species.id}>
                    <Text color={isCursor ? GREEN : GRAY}>{isCursor ? ' ▸' : '  '}</Text>
                    <Text color={GRAY}>#{String(species.dexNumber).padStart(3, '0')} </Text>
                    <Text color={isCursor ? WHITE : GRAY} bold={inParty}>
                      {species.name}
                    </Text>
                    {inParty && <Text color={YELLOW}>★</Text>}
                  </Box>
                );
              })}
              {startIdx + MAX_VISIBLE_DEX < discovered.length && (
                <Text color={GRAY}>  ↓ {discovered.length - startIdx - MAX_VISIBLE_DEX} more</Text>
              )}
            </>
          ) : (
            <Text dimColor> No species discovered yet</Text>
          )}
        </Box>

        {/* Divider */}
        <Box flexDirection="column">
          <Text color={GRAY}>│</Text>
        </Box>

        {/* Right: gen stats */}
        <Box flexDirection="column" flexGrow={1} marginLeft={1}>
          <Text color={GRAY}>─── 分代统计 ───</Text>
          {genStats.map(g => {
            const p = g.total > 0 ? g.collected / g.total : 0;
            const miniBar = '█'.repeat(Math.round(p * 10)) + '░'.repeat(10 - Math.round(p * 10));
            return (
              <Box key={g.label}>
                <Text color={GRAY}>{g.label.padEnd(8)}</Text>
                <Text color={p >= 1 ? GREEN : p > 0 ? YELLOW : GRAY}>{miniBar}</Text>
                <Text> <Text bold>{g.collected}</Text><Text color={GRAY}>/{g.total}</Text></Text>
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* Footer */}
      <Box marginTop={0}>
        <Text color={GRAY}>Turns:{buddyData.stats.totalTurns} Days:{buddyData.stats.consecutiveDays} Eggs:{buddyData.stats.totalEggsObtained} Evos:{buddyData.stats.totalEvolutions}</Text>
      </Box>
      {buddyData.eggs.length > 0 && (
        <Box><Text color={YELLOW}>🥚 {buddyData.eggs[0].stepsRemaining}/{buddyData.eggs[0].totalSteps} steps</Text></Box>
      )}
      <Box>
        <Text color={CYAN}>[↑↓] 浏览 · [Enter] 详情 · [S] 搜索 · [Esc] 关闭</Text>
      </Box>
    </Box>
  );
}

// ─── Egg Tab ──────────────────────────────────────────

function EggTab({ buddyData }: { buddyData: BuddyData }) {
  const eggs = buddyData.eggs;

  if (eggs.length === 0) {
    // Include today in progress even if updateDailyStats hasn't run yet
    const today = new Date().toISOString().split('T')[0];
    const lastDate = buddyData.stats.lastActiveDate;
    let effectiveDays = buddyData.stats.consecutiveDays;
    if (lastDate !== today) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      effectiveDays = lastDate === yesterdayStr ? effectiveDays + 1 : 1;
    }
    const progress = Math.min(effectiveDays, EGG_REQUIRED_DAYS);
    const filled = Math.round((progress / EGG_REQUIRED_DAYS) * 10);
    const empty = 10 - filled;
    const daysLeft = Math.max(0, EGG_REQUIRED_DAYS - effectiveDays);

    return (
      <Box flexDirection="column">
        <Text bold color={CYAN}>
          Egg
        </Text>
        <Text color={GRAY}>No egg currently. Keep coding!</Text>
        <Box marginTop={0}>
          <Text color={GRAY}>Egg progress </Text>
          <Text color={progress >= EGG_REQUIRED_DAYS ? GREEN : YELLOW}>
            {'█'.repeat(filled)}
            {'░'.repeat(empty)}
          </Text>
          <Text> {progress}/{EGG_REQUIRED_DAYS} days</Text>
        </Box>
        {daysLeft > 0 ? (
          <Text color={GRAY}>Next egg: {daysLeft} more day{daysLeft > 1 ? 's' : ''}</Text>
        ) : (
          <Text color={GREEN}>Ready! Keep coding to trigger an egg.</Text>
        )}
      </Box>
    );
  }

  const egg = eggs[0]!;
  const percentage = Math.floor(((egg.totalSteps - egg.stepsRemaining) / egg.totalSteps) * 100);
  const filled = Math.round(percentage / 10);
  const empty = 10 - filled;

  return (
    <Box flexDirection="column">
      <Text bold color={CYAN}>
        Egg Status
      </Text>

      <Box flexDirection="column" alignItems="center" marginY={0}>
        <Text> . </Text>
        <Text> / \ </Text>
        <Text> | | </Text>
        <Text> \_/ </Text>
      </Box>

      <Box flexDirection="column" alignItems="center">
        <Text>
          Steps: {egg.totalSteps - egg.stepsRemaining} / {egg.totalSteps}
        </Text>
        <Text color={YELLOW}>
          {'█'.repeat(filled)}
          {'░'.repeat(empty)}
        </Text>
        <Text>{percentage}%</Text>
      </Box>

      <Box marginTop={0} flexDirection="column" alignItems="center">
        <Text color={GRAY}>Pet (+5) · Chat (+3) · Cmd (+1)</Text>
        <Text color={GRAY}>Hatch: ~{egg.stepsRemaining} more interactions</Text>
      </Box>

      <Box marginTop={0} flexDirection="column">
        <Text color={GRAY}>─── Egg Stats ───</Text>
        <Box>
          <Text color={GRAY}>Total eggs: </Text>
          <Text>{buddyData.stats.totalEggsObtained}</Text>
        </Box>
      </Box>
    </Box>
  );
}

// ─── PC Box Tab ──────────────────────────────────────

const BOX_COLS = 6
const BOX_SIZE = 30
const PARTY_SLOTS = 6

type Panel = 'party' | 'box'

function PcBoxTab({ data, onUpdate, isActive }: { data: BuddyData; onUpdate: (d: BuddyData) => void; isActive: boolean }) {
  const [boxIdx, setBoxIdx] = useState(0)
  const [panel, setPanel] = useState<Panel>('box')
  const [partyCursor, setPartyCursor] = useState(0) // 0-5
  const [boxCursor, setBoxCursor] = useState(0) // 0-29
  const [held, setHeld] = useState<{ id: string; from: Panel; partySlot?: number; boxSlot?: number } | null>(null)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)

  const partySet = new Set(data.party.filter((id): id is string => id !== null))
  const box = data.boxes[boxIdx]!
  const boxRows = Math.ceil(BOX_SIZE / BOX_COLS)

  // Currently selected creature
  const selectedCreature = panel === 'party'
    ? (data.party[partyCursor] ? data.creatures.find(c => c.id === data.party[partyCursor]) ?? null : null)
    : (box.slots[boxCursor] ? data.creatures.find(c => c.id === box.slots[boxCursor]) ?? null : null)

  useInput((_input, key) => {
    if (!isActive) return

    // Switch box with ,/. regardless of panel
    if (_input === ',' || _input === '<') {
      setBoxIdx(prev => (prev - 1 + data.boxes.length) % data.boxes.length)
      setStatusMsg(null)
      return
    }
    if (_input === '.' || _input === '>') {
      setBoxIdx(prev => (prev + 1) % data.boxes.length)
      setStatusMsg(null)
      return
    }

    if (panel === 'party') {
      // Party: up/down navigate, left/right does nothing
      if (key.upArrow) { setPartyCursor(prev => Math.max(0, prev - 1)); setStatusMsg(null); return }
      if (key.downArrow) { setPartyCursor(prev => Math.min(PARTY_SLOTS - 1, prev + 1)); setStatusMsg(null); return }
      if (key.rightArrow) { setPanel('box'); setStatusMsg(null); return }

      if (_input === ' ') {
        const slotId = data.party[partyCursor]
        if (!held && !slotId) return

        if (!held) {
          // Pick up from party
          setHeld({ id: slotId!, from: 'party', partySlot: partyCursor })
          setStatusMsg(`Picked up ${getCreatureName(data.creatures.find(c => c.id === slotId!)!)}`)
          return
        }

        // Place / swap into party slot
        let updated = { ...data, party: [...data.party], boxes: data.boxes.map(b => ({ ...b, slots: [...b.slots] })) }
        if (slotId) {
          // Swap
          updated.party[partyCursor] = held.id
          if (held.from === 'party') {
            updated.party[held.partySlot!] = slotId
          } else {
            updated.boxes[boxIdx]!.slots[held.boxSlot!] = slotId
          }
        } else {
          // Empty party slot: place held
          updated.party[partyCursor] = held.id
          if (held.from === 'party') {
            updated.party[held.partySlot!] = null
          } else {
            updated.boxes[boxIdx]!.slots[held.boxSlot!] = null
          }
        }
        updated.party = compactParty(updated.party)
        onUpdate(updated)
        setHeld(null)
        setStatusMsg('Done!')
        return
      }

      // Cancel held
      if (key.escape && held) { setHeld(null); setStatusMsg('Cancelled'); return }
      return
    }

    // ─── Box panel ───
    if (panel === 'box') {
      if (key.leftArrow) {
        if (boxCursor % BOX_COLS === 0) {
          setPanel('party')
        } else {
          setBoxCursor(prev => prev - 1)
        }
        setStatusMsg(null)
        return
      }
      if (key.rightArrow) {
        setBoxCursor(prev => (prev % BOX_COLS === BOX_COLS - 1 ? prev : prev + 1))
        setStatusMsg(null)
        return
      }
      if (key.upArrow) {
        setBoxCursor(prev => (prev < BOX_COLS ? prev + BOX_SIZE - BOX_COLS : prev - BOX_COLS))
        setStatusMsg(null)
        return
      }
      if (key.downArrow) {
        setBoxCursor(prev => (prev >= BOX_SIZE - BOX_COLS ? prev - BOX_SIZE + BOX_COLS : prev + BOX_COLS))
        setStatusMsg(null)
        return
      }

      // Tab to party
      if (_input.toLowerCase() === 'p') { setPanel('party'); setStatusMsg(null); return }

      if (_input === ' ') {
        const slotId = box.slots[boxCursor]

        if (!held && !slotId) return

        if (!held) {
          // Pick up from box
          setHeld({ id: slotId!, from: 'box', boxSlot: boxCursor })
          setStatusMsg(`Picked up ${getCreatureName(data.creatures.find(c => c.id === slotId!)!)}`)
          return
        }

        // Place / swap into box slot — direct slot manipulation
        let updated = { ...data, party: [...data.party], boxes: data.boxes.map(b => ({ ...b, slots: [...b.slots] })) }
        if (slotId) {
          // Swap
          updated.boxes[boxIdx]!.slots[boxCursor] = held.id
          if (held.from === 'box') {
            updated.boxes[boxIdx]!.slots[held.boxSlot!] = slotId
          } else {
            updated.party[held.partySlot!] = slotId
          }
        } else {
          // Empty box slot: place held
          if (held.from === 'party') {
            const partyCount = updated.party.filter(Boolean).length
            if (partyCount <= 1) {
              setStatusMsg('Cannot deposit last party member!')
              return
            }
          }
          updated.boxes[boxIdx]!.slots[boxCursor] = held.id
          if (held.from === 'box') {
            updated.boxes[boxIdx]!.slots[held.boxSlot!] = null
          } else {
            updated.party[held.partySlot!] = null
          }
        }
        updated.party = compactParty(updated.party)
        onUpdate(updated)
        setHeld(null)
        setStatusMsg('Done!')
        return
      }

      if (key.escape && held) { setHeld(null); setStatusMsg('Cancelled'); return }
      if (key.escape && !held) { setPanel('party'); return }
    }
  })

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box justifyContent="space-between">
        <Box>
          <Text bold color={CYAN}>PC Box</Text>
          {held && <Text color={YELLOW}> ✦ Carrying: {getCreatureName(data.creatures.find(c => c.id === held.id)!)}</Text>}
        </Box>
        <Text color={GRAY}>{box.name} ({boxIdx + 1}/{data.boxes.length})</Text>
      </Box>

      <Box flexDirection="row">
        {/* Left: Party */}
        <Box flexDirection="column" width={16} borderStyle="round" borderColor={panel === 'party' ? CYAN : GRAY} paddingX={1}>
          <Text bold color={CYAN}>Party</Text>
          {data.party.map((slotId, i) => {
            const c = slotId ? data.creatures.find(cr => cr.id === slotId) : null
            const isCursor = panel === 'party' && i === partyCursor
            return (
              <Box key={i}>
                <Text color={isCursor ? CYAN : GRAY}>{isCursor ? '▸' : ' '}</Text>
                {c ? (
                  <Text>
                    <Text color={i === 0 ? YELLOW : WHITE} bold={isCursor}>
                      {getCreatureName(c).length > 8 ? getCreatureName(c).slice(0, 7) + '..' : getCreatureName(c)}
                    </Text>
                    <Text color={GRAY}> {c.level}</Text>
                    {c.isShiny && <Text color={YELLOW}>★</Text>}
                  </Text>
                ) : (
                  <Text color={GRAY}>---</Text>
                )}
              </Box>
            )
          })}
          <Text color={GRAY}>Total: {data.creatures.length}</Text>
        </Box>

        {/* Right: Box grid */}
        <Box flexDirection="column" borderStyle="round" borderColor={panel === 'box' ? CYAN : GRAY} paddingX={1} flexGrow={1}>
          {Array.from({ length: boxRows }, (_, row) => (
            <Box key={row}>
              {Array.from({ length: BOX_COLS }, (_, col) => {
                const slotIdx = row * BOX_COLS + col
                const slotId = box.slots[slotIdx]
                const c = slotId ? data.creatures.find(cr => cr.id === slotId) : null
                const isCursor = panel === 'box' && slotIdx === boxCursor

                return (
                  <Box key={col} width={11}>
                    {c ? (
                      <Text color={isCursor ? CYAN : GRAY} bold={isCursor}>
                        {isCursor ? '[' : ' '}
                        {getCreatureName(c).length > 5 ? getCreatureName(c).slice(0, 4) + '.' : getCreatureName(c).padEnd(5)}
                        {isCursor ? ']' : ' '}
                        {String(c.level).padStart(2)}
                      </Text>
                    ) : (
                      <Text color={isCursor ? CYAN : undefined}>{isCursor ? '[ --- ]' : '  ...  '}</Text>
                    )}
                  </Box>
                )
              })}
            </Box>
          ))}
        </Box>
      </Box>

      {/* Selected creature info */}
      {selectedCreature && (
        <Box flexDirection="column">
          <Text color={GRAY}>─── {getCreatureName(selectedCreature)} ───</Text>
          <Box>
            <Text color={CYAN}>Lv.{selectedCreature.level}</Text>
            <Text color={GRAY}> {getSpeciesData(selectedCreature.speciesId).name}</Text>
            <Text color={GRAY}> {getGenderSymbol(selectedCreature.gender)}</Text>
            {selectedCreature.isShiny && <Text color={YELLOW}> ★SHINY</Text>}
            {partySet.has(selectedCreature.id) && <Text color={GREEN}> ★ Party</Text>}
          </Box>
        </Box>
      )}

      {statusMsg && (
        <Box><Text color={GREEN} italic>{statusMsg}</Text></Box>
      )}

      <Box>
        <Text color={GRAY}>[Space] 拾取/放置 · [Esc] 返回/取消 · [,/.] 切箱 · [Tab] 切到标签栏</Text>
      </Box>
    </Box>
  )
}

// ─── Helpers ──────────────────────────────────────────

function getStatColor(stat: string): Color {
  const colors: Record<string, Color> = {
    hp: 'ansi:green',
    attack: 'ansi:red',
    defense: 'ansi:yellow',
    spAtk: 'ansi:blue',
    spDef: 'ansi:magenta',
    speed: 'ansi:cyan',
  };
  return colors[stat] ?? 'ansi:white';
}

function getGenderInfoText(genderRate: number): string {
  if (genderRate === -1) return 'Genderless';
  if (genderRate === 0) return '♂ 100%';
  if (genderRate === 8) return '♀ 100%';
  return `♀ ${(genderRate / 8) * 100}%`;
}

/** Build full evolution chain for a species by walking backwards then forwards */
function getChainFor(speciesId: SpeciesId): SpeciesId[] {
  const chain: SpeciesId[] = []
  // Walk backwards to find the base form
  let current: SpeciesId | undefined = speciesId
  const visited = new Set<string>()
  while (current) {
    if (visited.has(current)) break
    visited.add(current)
    chain.unshift(current)
    // Find pre-evolution
    const dex = getSpeciesData(current)
    // Check if any species evolves into current
    const preEvo = ALL_SPECIES_IDS.find(id => {
      const next = getNextEvolution(id)
      return next?.to === current
    })
    if (preEvo) {
      current = preEvo
    } else {
      break
    }
  }
  // Walk forwards from each node to find branches
  const fullChain: SpeciesId[] = [...chain]
  for (const sid of [...chain]) {
    const next = getNextEvolution(sid)
    if (next && !fullChain.includes(next.to)) {
      fullChain.push(next.to)
    }
  }
  return fullChain
}
