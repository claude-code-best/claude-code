import * as React from 'react';
import { useMemo, useState } from 'react';
import {
  type Command,
  type CommandBase,
  type CommandResultDisplay,
  getCommandName,
  type PromptCommand,
} from '../../commands.js';
import { Box, FuzzyPicker, Text } from '@anthropic/ink';
import type { Theme } from '@anthropic/ink';
import { estimateSkillFrontmatterTokens } from '../../skills/loadSkillsDir.js';
import { formatTokens } from '../../utils/format.js';
import { getSettingSourceName, type SettingSource } from '../../utils/settings/constants.js';
import { plural } from '../../utils/stringUtils.js';
import { ConfigurableShortcutHint } from '../ConfigurableShortcutHint.js';
import { Dialog } from '@anthropic/ink';
import { filterSkills } from './filterSkills.js';

// Skills are always PromptCommands with CommandBase properties
type SkillCommand = CommandBase & PromptCommand;

type SkillSource = SettingSource | 'plugin' | 'mcp';

const ORDERED_SOURCES: SkillSource[] = [
  'projectSettings',
  'localSettings',
  'userSettings',
  'flagSettings',
  'policySettings',
  'plugin',
  'mcp',
];

type Props = {
  onExit: (result?: string, options?: { display?: CommandResultDisplay }) => void;
  commands: Command[];
};

function getSourceLabel(source: SkillSource): string {
  if (source === 'plugin') return 'plugin';
  if (source === 'mcp') return 'mcp';
  return getSettingSourceName(source);
}

export function SkillsMenu({ onExit, commands }: Props): React.ReactNode {
  const [searchQuery, setSearchQuery] = useState('');

  // Filter commands for skills and cast to SkillCommand
  const skills = useMemo(() => {
    return commands.filter(
      (cmd): cmd is SkillCommand =>
        cmd.type === 'prompt' &&
        (cmd.loadedFrom === 'skills' ||
          cmd.loadedFrom === 'commands_DEPRECATED' ||
          cmd.loadedFrom === 'plugin' ||
          cmd.loadedFrom === 'mcp'),
    );
  }, [commands]);

  // Apply type-to-filter: build SkillItem-shaped projections and filter
  const filteredSkills = useMemo(() => {
    return filterSkills(
      skills.map(s => ({
        ...s,
        name: getCommandName(s),
        description: s.description ?? '',
      })),
      searchQuery,
    );
  }, [skills, searchQuery]);

  const skillsBySource = useMemo((): Record<SkillSource, SkillCommand[]> => {
    const groups: Record<SkillSource, SkillCommand[]> = {
      policySettings: [],
      userSettings: [],
      projectSettings: [],
      localSettings: [],
      flagSettings: [],
      plugin: [],
      mcp: [],
    };

    for (const skill of filteredSkills) {
      const source = skill.source as SkillSource;
      if (source in groups) {
        groups[source].push(skill);
      }
    }

    for (const group of Object.values(groups)) {
      group.sort((a, b) => getCommandName(a).localeCompare(getCommandName(b)));
    }

    return groups;
  }, [filteredSkills]);

  const handleCancel = (): void => {
    onExit('Skills dialog dismissed', { display: 'system' });
  };

  if (skills.length === 0) {
    return (
      <Dialog title="Skills" subtitle="No skills found" onCancel={handleCancel} hideInputGuide>
        <Text dimColor>Create skills in .claude/skills/ or ~/.claude/skills/</Text>
        <Text dimColor italic>
          <ConfigurableShortcutHint action="confirm:no" context="Confirmation" fallback="Esc" description="close" />
        </Text>
      </Dialog>
    );
  }

  const getScopeTag = (source: string): { label: string; color: string } | undefined => {
    switch (source) {
      case 'projectSettings':
      case 'localSettings':
        return { label: 'local', color: 'yellow' };
      case 'userSettings':
        return { label: 'global', color: 'cyan' };
      case 'policySettings':
        return { label: 'managed', color: 'magenta' };
      default:
        return undefined;
    }
  };

  const renderSkillItem = (skill: SkillCommand, isFocused: boolean) => {
    const estimatedTokens = estimateSkillFrontmatterTokens(skill);
    const tokenDisplay = `~${formatTokens(estimatedTokens)}`;
    const pluginName = skill.source === 'plugin' ? skill.pluginInfo?.pluginManifest.name : undefined;
    const scopeTag = getScopeTag(skill.source);

    return (
      <Box>
        <Text color={isFocused ? ('suggestion' as keyof Theme) : undefined}>{getCommandName(skill)}</Text>
        {scopeTag && <Text color={scopeTag.color as keyof Theme}> [{scopeTag.label}]</Text>}
        <Text dimColor>
          {pluginName ? ` · ${pluginName}` : ''} · {getSourceLabel(skill.source as SkillSource)} · {tokenDisplay} tokens
        </Text>
      </Box>
    );
  };

  // Flat ordered list of filtered skills preserving source grouping order
  const orderedFilteredSkills = useMemo(() => {
    return ORDERED_SOURCES.flatMap(source => skillsBySource[source]);
  }, [skillsBySource]);

  const subtitle =
    searchQuery.trim() === ''
      ? `${skills.length} ${plural(skills.length, 'skill')}`
      : `${filteredSkills.length}/${skills.length} ${plural(skills.length, 'skill')}`;

  // Source group headers — rendered as section labels inside the picker list
  // via renderItem. We annotate each item with its source to detect group
  // boundary changes.
  return (
    <FuzzyPicker
      title="Skills"
      placeholder="Type to filter skills…"
      items={orderedFilteredSkills}
      getKey={s => `${s.name}-${s.source}`}
      visibleCount={12}
      direction="down"
      onQueryChange={setSearchQuery}
      onSelect={skill => {
        onExit(`/${getCommandName(skill)}`, { display: 'user' });
      }}
      onCancel={handleCancel}
      emptyMessage={q => (q.trim() ? `No skills matching "${q.trim()}"` : 'No skills found')}
      matchLabel={subtitle}
      selectAction="invoke skill"
      renderItem={(skill, isFocused) => renderSkillItem(skill, isFocused)}
    />
  );
}
