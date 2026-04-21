import * as React from 'react';
import { useState } from 'react';
import { Box, Text, Pane, Tab, Tabs, useInput, type Color } from '@anthropic/ink';
import { useSetAppState } from '../../state/AppState.js';
import { useKeybinding } from '../../keybindings/useKeybinding.js';
import { useExitOnCtrlCDWithKeybindings } from '../../hooks/useExitOnCtrlCDWithKeybindings.js';
import { Select } from '../../components/CustomSelect/select.js';
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
import { calculateStats, getCreatureName, getTotalEV, getActiveCreature, saveBuddyData, EGG_REQUIRED_DAYS, addToParty, swapPartySlots, removeFromParty } from '@claude-code-best/pokemon';
import { getXpProgress } from '@claude-code-best/pokemon';

import { getGenderSymbol } from '@claude-code-best/pokemon';
import { StatBar, SpriteAnimator, getFallbackSprite, loadSprite } from '@claude-code-best/pokemon';
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

  const updateData = (updated: BuddyData) => {
    setData(updated);
    saveBuddyData(updated);
    setAppState(prev => ({ ...prev, companionCreatureChangedAt: Date.now() }));
  };

  const tabs = [
    <Tab key="buddy" title="Buddy">
      <PartyView data={data} onUpdate={updateData} isActive={selectedTab === 'Buddy'} />
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
      <Tabs color="permission" selectedTab={selectedTab} onTabChange={setSelectedTab} initialHeaderFocused={true}>
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

  useInput((_input, key) => {
    if (!isActive) return;
    if (_input === 'a' || _input === 'A') {
      setFocusedSlot(prev => (prev > 0 ? prev - 1 : 5));
      setTick(t => t + 1);
      setStatusMsg(null);
    } else if (_input === 'd' || _input === 'D') {
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
        <Text color={GRAY} dimColor>a/d navigate · Enter swap · X remove</Text>
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
      → <Text color={CYAN}>{getSpeciesData(nextEvo.to).names.zh ?? getSpeciesData(nextEvo.to).name}</Text> Lv.
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
        <Text color={GRAY}>{species.names.zh ?? species.name}</Text>
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
  const flatSpecies = groupByChain().flat();
  const partySet = new Set(buddyData.party.filter((id): id is string => id !== null));

  const [focusedId, setFocusedId] = useState<SpeciesId>(flatSpecies[0]);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Build options for the Select component
  const options = flatSpecies.map(speciesId => {
    const species = getSpeciesData(speciesId);
    const entry = dexMap.get(speciesId);
    const discovered = !!entry;
    const inParty = buddyData.creatures.some(c => partySet.has(c.id) && c.speciesId === speciesId);

    return {
      label: (
        <Text>
          <Text color={GRAY}>#{String(species.dexNumber).padStart(3, '0')} </Text>
          <Text color={discovered ? WHITE : GRAY} bold={inParty}>
            {discovered ? (species.names.zh ?? species.name) : '???'}
          </Text>
          {inParty && <Text color={YELLOW}> ★</Text>}
        </Text>
      ),
      value: speciesId,
      disabled: false,
    };
  });

  // Right panel data
  const focusedSpecies = getSpeciesData(focusedId);
  const focusedEntry = dexMap.get(focusedId);
  const focusedDiscovered = !!focusedEntry;
  const focusedOwned = buddyData.creatures.find(c => c.speciesId === focusedId);
  const focusedInParty = focusedOwned ? partySet.has(focusedOwned.id) : false;

  const spriteLines = focusedDiscovered
    ? (loadSprite(focusedId)?.lines ?? getFallbackSprite(focusedId))
    : null;

  const maxBase = 130;

  const handleAddToParty = (speciesId: SpeciesId) => {
    const creature = buddyData.creatures.find(c => c.speciesId === speciesId);
    if (!creature) return;

    // Already in party?
    if (partySet.has(creature.id)) {
      setStatusMsg('Already in party!');
      return;
    }

    const result = addToParty(buddyData, creature.id);
    if (result.added) {
      onUpdate(result.data);
      setStatusMsg(`Added ${getCreatureName(creature)} to party!`);
    } else {
      setStatusMsg('Party is full! Remove a member first.');
    }
  };

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box justifyContent="space-between">
        <Text bold color={CYAN}>Pokédex</Text>
        <Text>
          <Text bold color={collected === total ? GREEN : WHITE}>{collected}</Text>
          <Text color={GRAY}>/{total}</Text>
          <Text> </Text>
          <Text color={GREEN}>{'█'.repeat(collected)}</Text>
          <Text color={GRAY}>{'░'.repeat(total - collected)}</Text>
          <Text> {Math.floor((collected / total) * 100)}%</Text>
        </Text>
      </Box>

      {/* Two-column: Select list | detail */}
      <Box flexDirection="row">
        {/* ── Left: Select list ── */}
        <Box width={20}>
          <Select
            options={options}
            onFocus={(value: SpeciesId) => { setFocusedId(value); setStatusMsg(null); }}
            onChange={(value: SpeciesId) => handleAddToParty(value)}
            onCancel={onClose}
            visibleOptionCount={flatSpecies.length}
            hideIndexes
            layout="compact"
            isDisabled={!isActive}
          />
        </Box>

        {/* ── Divider ── */}
        <Box flexDirection="column">
          {Array.from({ length: flatSpecies.length }, (_, i) => (
            <Text key={i} color={GRAY}>│</Text>
          ))}
        </Box>

        {/* ── Right: detail panel ── */}
        <Box flexDirection="column" flexGrow={1} marginLeft={1}>
          {focusedDiscovered ? (
            <>
              {/* Sprite */}
              {spriteLines && (
                <Box flexDirection="column" alignItems="center">
                  {spriteLines.map((line, i) => (
                    <Text key={i} color={CYAN}>{line}</Text>
                  ))}
                </Box>
              )}

              {/* Name header */}
              <Box justifyContent="center">
                <Text bold color={CYAN}>#{String(focusedSpecies.dexNumber).padStart(3, '0')} </Text>
                <Text bold color={WHITE}>{focusedSpecies.names.zh ?? focusedSpecies.name}</Text>
                <Text color={GRAY}> {focusedSpecies.name}</Text>
              </Box>

              {/* Types + Gender */}
              <Box justifyContent="center">
                {focusedSpecies.types
                  .filter((t): t is string => Boolean(t))
                  .map((t, ti) => (
                    <React.Fragment key={t}>
                      {ti > 0 && <Text color={GRAY}>/</Text>}
                      <Text color={TYPE_COLORS[t] ?? GRAY}>{t.toUpperCase()}</Text>
                    </React.Fragment>
                  ))}
                <Text color={GRAY}>  {getGenderInfoText(focusedSpecies.genderRate)}</Text>
              </Box>

              {/* Base Stats */}
              <Box flexDirection="column" marginTop={0}>
                <Text color={GRAY}>─── Base Stats ───</Text>
                {STAT_NAMES.map(stat => {
                  const val = focusedSpecies.baseStats[stat];
                  const filled = Math.round((val / maxBase) * 12);
                  return (
                    <Box key={stat}>
                      <Text color={WHITE}>{STAT_LABELS[stat].padEnd(3)}</Text>
                      <Text color={getStatColor(stat)}>
                        {'█'.repeat(filled)}
                        {'░'.repeat(12 - filled)}
                      </Text>
                      <Text> {String(val).padStart(3)}</Text>
                    </Box>
                  );
                })}
                <Box>
                  <Text color={WHITE}>{'Total'.padEnd(3)}</Text>
                  <Text color={GRAY}>{'─'.repeat(12)}</Text>
                  <Text bold> {Object.values(focusedSpecies.baseStats).reduce((a, b) => a + b, 0)}</Text>
                </Box>
              </Box>

              {/* Evolution chain */}
              {(() => {
                const evoChain = getChainFor(focusedId);
                if (evoChain.length <= 1) return null;
                return (
                  <Box flexDirection="column" marginTop={0}>
                    <Text color={GRAY}>─── Evolution ───</Text>
                    <Box>
                      {evoChain.map((sid, i) => {
                        const next = getNextEvolution(sid);
                        return (
                          <React.Fragment key={sid}>
                            {i > 0 && <Text color={GRAY}> → </Text>}
                            <Text color={sid === focusedId ? CYAN : GRAY} bold={sid === focusedId}>
                              {getSpeciesData(sid).names.zh ?? getSpeciesData(sid).name}
                            </Text>
                            {next && <Text color={GRAY}> Lv.{next.minLevel}</Text>}
                          </React.Fragment>
                        );
                      })}
                    </Box>
                  </Box>
                );
              })()}

              {/* Flavor text */}
              {focusedSpecies.flavorText && (
                <Box marginTop={0}>
                  <Text color={GRAY} italic>"{focusedSpecies.flavorText}"</Text>
                </Box>
              )}

              {/* Status */}
              <Box marginTop={0}>
                {statusMsg ? (
                  <Text color={GREEN} italic>{statusMsg}</Text>
                ) : focusedOwned ? (
                  focusedInParty ? (
                    <Text color={GREEN}>★ In party</Text>
                  ) : (
                    <Text color={CYAN}>Enter → add to party</Text>
                  )
                ) : (
                  <Text color={GRAY}>Not owned</Text>
                )}
              </Box>
            </>
          ) : (
            <>
              <Box flexDirection="column" alignItems="center" marginTop={2}>
                <Text color={GRAY}>{'  ???  '}</Text>
                <Text color={GRAY}>{' /   \\'}</Text>
                <Text color={GRAY}>{' | ? |'}</Text>
                <Text color={GRAY}>{' \\_/'}</Text>
              </Box>
              <Box justifyContent="center" marginTop={1}>
                <Text bold color={GRAY}>#{String(focusedSpecies.dexNumber).padStart(3, '0')} ???</Text>
              </Box>
              <Box justifyContent="center">
                <Text color={GRAY} italic>Undiscovered species...</Text>
              </Box>
            </>
          )}
        </Box>
      </Box>

      {/* Footer */}
      <Box marginTop={0}>
        <Text color={GRAY}>Turns:{buddyData.stats.totalTurns} Days:{buddyData.stats.consecutiveDays} Eggs:{buddyData.stats.totalEggsObtained} Evos:{buddyData.stats.totalEvolutions}</Text>
      </Box>
      {buddyData.eggs.length > 0 && (
        <Box>
          <Text color={YELLOW}>🥚 {buddyData.eggs[0].stepsRemaining}/{buddyData.eggs[0].totalSteps} steps</Text>
        </Box>
      )}
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

function groupByChain(): SpeciesId[][] {
  return [
    ['bulbasaur', 'ivysaur', 'venusaur'],
    ['charmander', 'charmeleon', 'charizard'],
    ['squirtle', 'wartortle', 'blastoise'],
    ['pikachu'],
  ];
}

function getGenderInfoText(genderRate: number): string {
  if (genderRate === -1) return 'Genderless';
  if (genderRate === 0) return '♂ 100%';
  if (genderRate === 8) return '♀ 100%';
  return `♀ ${(genderRate / 8) * 100}%`;
}

/** Get full evolution chain containing this species */
function getChainFor(speciesId: SpeciesId): SpeciesId[] {
  const chainHeads: SpeciesId[] = ['bulbasaur', 'charmander', 'squirtle', 'pikachu'];
  let head: SpeciesId = speciesId;
  for (const starter of chainHeads) {
    if (isInChain(speciesId, starter)) {
      head = starter;
      break;
    }
  }
  const chain: SpeciesId[] = [head];
  let current: SpeciesId | undefined = head;
  while (current) {
    const next = getNextEvolution(current);
    if (next) {
      chain.push(next.to);
      current = next.to;
    } else {
      current = undefined;
    }
  }
  return chain;
}

function isInChain(target: SpeciesId, head: SpeciesId): boolean {
  let current: SpeciesId | undefined = head;
  while (current) {
    if (current === target) return true;
    const next = getNextEvolution(current);
    current = next ? next.to : undefined;
  }
  return false;
}
