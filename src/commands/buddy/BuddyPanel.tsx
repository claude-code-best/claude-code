import * as React from 'react';
import { useState } from 'react';
import { Box, Text, Pane, Tab, Tabs, type Color } from '@anthropic/ink';
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
import { SPECIES_DATA } from '@claude-code-best/pokemon';
import { SPECIES_PERSONALITY } from '@claude-code-best/pokemon';
import { getNextEvolution } from '@claude-code-best/pokemon';
import { calculateStats, getCreatureName, getTotalEV, getActiveCreature } from '@claude-code-best/pokemon';
import { getXpProgress } from '@claude-code-best/pokemon';
import { getEVSummary } from '@claude-code-best/pokemon';
import { getGenderSymbol } from '@claude-code-best/pokemon';
import { StatBar } from '@claude-code-best/pokemon';
import type { LocalJSXCommandContext, LocalJSXCommandOnDone } from '../../types/command.js';

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

  useExitOnCtrlCDWithKeybindings();

  const handleEscape = () => {
    onClose('buddy panel closed');
  };

  useKeybinding('confirm:no', handleEscape, {
    context: 'Settings',
    isActive: true,
  });

  const creature = getActiveCreature(buddyData);

  const tabs = [
    <Tab key="buddy" title="Buddy">
      {creature ? (
        <BuddyTab creature={creature} buddyData={buddyData} spriteLines={spriteLines} />
      ) : (
        <Text color={GRAY}>No buddy yet. Keep coding!</Text>
      )}
    </Tab>,
    <Tab key="dex" title="Pokédex">
      <DexTab buddyData={buddyData} />
    </Tab>,
    <Tab key="egg" title="Egg">
      <EggTab buddyData={buddyData} />
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

// ─── Buddy Tab ────────────────────────────────────────

function BuddyTab({
  creature,
  buddyData,
  spriteLines,
}: {
  creature: Creature;
  buddyData: BuddyData;
  spriteLines?: string[];
}) {
  const species = SPECIES_DATA[creature.speciesId];
  const stats = calculateStats(creature);
  const xp = getXpProgress(creature);
  const genderSymbol = getGenderSymbol(creature.gender);
  const name = getCreatureName(creature);
  const evSummary = getEVSummary(creature);
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
      → <Text color={CYAN}>{SPECIES_DATA[nextEvo.to].names.zh ?? SPECIES_DATA[nextEvo.to].name}</Text> Lv.
      {nextEvo.minLevel}
    </Text>
  ) : null;

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between">
        <Box>
          <Text bold color={CYAN}>
            {name}
          </Text>
          <Text color={GRAY}> #{String(species.dexNumber).padStart(3, '0')}</Text>
          {shinyBadge}
        </Box>
        <Text bold>Lv.{creature.level}</Text>
      </Box>

      <Box>
        <Text color={GRAY}>{species.names.zh ?? species.name}</Text>
        <Text> </Text>
        {typeBadges}
        {genderSymbol && <Text> {genderSymbol}</Text>}
      </Box>

      {spriteLines && (
        <Box flexDirection="column" alignItems="center" marginY={0}>
          {spriteLines.map((line, i) => (
            <Text key={i}>{line}</Text>
          ))}
        </Box>
      )}

      <Box>
        <Text color={GRAY} italic>
          "{SPECIES_PERSONALITY[creature.speciesId] ?? species.personality}"
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={0}>
        <Text color={GRAY}>─── Stats ───</Text>
        {STAT_NAMES.map(stat => (
          <StatBar key={stat} label={STAT_LABELS[stat]} value={stats[stat]} maxValue={255} color={getStatColor(stat)} />
        ))}
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

      <Box flexDirection="column">
        <Box>
          <Text color={GRAY}>EV </Text>
          <Text color={totalEV >= 510 ? GREEN : GRAY}>{evSummary}</Text>
          <Text color={GRAY}> ({totalEV}/510)</Text>
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

function DexTab({ buddyData }: { buddyData: BuddyData }) {
  const dexMap = new Map(buddyData.dex.map(d => [d.speciesId, d]));
  const collected = buddyData.dex.length;
  const total = ALL_SPECIES_IDS.length;
  const chains = groupByChain();

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between">
        <Text bold color={CYAN}>
          Pokédex
        </Text>
        <Text>
          <Text bold color={collected === total ? GREEN : WHITE}>
            {collected}
          </Text>
          <Text color={GRAY}>/{total}</Text>
        </Text>
      </Box>

      <Box>
        <Text color={GREEN}>{'█'.repeat(collected)}</Text>
        <Text color={GRAY}>{'░'.repeat(total - collected)}</Text>
        <Text> {Math.floor((collected / total) * 100)}%</Text>
      </Box>

      {chains.map((chain, ci) => (
        <Box key={ci} flexDirection="column">
          {chain.map((speciesId, si) => {
            const species = SPECIES_DATA[speciesId];
            const entry = dexMap.get(speciesId);
            const discovered = !!entry;
            const isActive = buddyData.activeCreatureId
              ? buddyData.creatures.some(c => c.id === buddyData.activeCreatureId && c.speciesId === speciesId)
              : false;
            const nextEvo = getNextEvolution(speciesId);

            return (
              <Box key={speciesId}>
                <Text color={GRAY}>{si === 0 ? ' ' : '├'}</Text>
                <Text>{isActive ? <Text color={YELLOW}>▶</Text> : ' '}</Text>
                <Text color={GRAY}>#{String(species.dexNumber).padStart(3, '0')} </Text>
                <Text color={discovered ? WHITE : GRAY} bold={isActive}>
                  {discovered ? (species.names.zh ?? species.name) : '???'}
                </Text>
                {discovered && (
                  <Text>
                    {' '}
                    {species.types
                      .filter((t): t is string => Boolean(t))
                      .map((t, ti) => (
                        <React.Fragment key={t}>
                          {ti > 0 && <Text color={GRAY}>/</Text>}
                          <Text color={TYPE_COLORS[t] ?? GRAY}>{t.slice(0, 3).toUpperCase()}</Text>
                        </React.Fragment>
                      ))}
                  </Text>
                )}
                {discovered && entry ? (
                  <Text color={GREEN}> Lv.{entry.bestLevel}</Text>
                ) : (
                  <Text color={GRAY}> ───</Text>
                )}
                {nextEvo && (
                  <Text color={GRAY}>
                    {' '}
                    →<Text color={CYAN}>Lv.{nextEvo.minLevel}</Text>
                  </Text>
                )}
              </Box>
            );
          })}
        </Box>
      ))}

      <Box marginTop={0} flexDirection="column">
        <Text color={GRAY}>─── Stats ───</Text>
        <Box>
          <Text color={GRAY}>Turns: </Text>
          <Text>{buddyData.stats.totalTurns}</Text>
          <Text color={GRAY}> Days: </Text>
          <Text>{buddyData.stats.consecutiveDays}</Text>
        </Box>
        <Box>
          <Text color={GRAY}>Eggs: </Text>
          <Text>{buddyData.stats.totalEggsObtained}</Text>
          <Text color={GRAY}> Evolutions: </Text>
          <Text>{buddyData.stats.totalEvolutions}</Text>
        </Box>
      </Box>

      {buddyData.eggs.length > 0 && (
        <Box marginTop={0}>
          <Text color={YELLOW}>🥚 Egg: </Text>
          <Text>
            {buddyData.eggs[0].stepsRemaining}/{buddyData.eggs[0].totalSteps}
          </Text>
          <Text color={GRAY}> steps</Text>
        </Box>
      )}
    </Box>
  );
}

// ─── Egg Tab ──────────────────────────────────────────

function EggTab({ buddyData }: { buddyData: BuddyData }) {
  const eggs = buddyData.eggs;

  if (eggs.length === 0) {
    return (
      <Box flexDirection="column">
        <Text bold color={CYAN}>
          Egg
        </Text>
        <Text color={GRAY}>No egg currently. Keep coding!</Text>
        {buddyData.stats.consecutiveDays < 7 && (
          <Text color={GRAY}>Next egg: {7 - buddyData.stats.consecutiveDays} more days</Text>
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
