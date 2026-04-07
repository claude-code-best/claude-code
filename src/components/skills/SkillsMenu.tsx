import capitalize from 'lodash-es/capitalize.js'
import * as React from 'react'
import { useMemo } from 'react'
import {
  type Command,
  type CommandBase,
  type CommandResultDisplay,
  getCommandName,
  type PromptCommand,
} from '../../commands.js'
import { Box, Text } from '../../ink.js'
import {
  estimateSkillFrontmatterTokens,
  getSkillsPath,
} from '../../skills/loadSkillsDir.js'
import { getDisplayPath } from '../../utils/file.js'
import { formatTokens } from '../../utils/format.js'
import {
  getSettingSourceName,
  type SettingSource,
} from '../../utils/settings/constants.js'
import { plural } from '../../utils/stringUtils.js'
import { ConfigurableShortcutHint } from '../ConfigurableShortcutHint.js'
import { Dialog } from '../design-system/Dialog.js'

// Skills are always PromptCommands with CommandBase properties
type SkillCommand = CommandBase & PromptCommand

type SkillSource = SettingSource | 'plugin' | 'mcp'

type Props = {
  onExit: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void
  commands: Command[]
}

function getSourceTitle(source: SkillSource): string {
  if (source === 'plugin') {
    return 'Plugin skills'
  }
  if (source === 'mcp') {
    return 'MCP skills'
  }
  return `${capitalize(getSettingSourceName(source))} skills`
}

function getSourceSubtitle(
  source: SkillSource,
  skills: SkillCommand[],
): string | undefined {
  // MCP skills show server names; file-based skills show filesystem paths.
  // Skill names are `<server>:<skill>`, not `mcp__<server>__…`.
  if (source === 'mcp') {
    const servers = [
      ...new Set(
        skills
          .map(s => {
            const idx = s.name.indexOf(':')
            return idx > 0 ? s.name.slice(0, idx) : null
          })
          .filter((n): n is string => n != null),
      ),
    ]
    return servers.length > 0 ? servers.join(', ') : undefined
  }
  const skillsPath = getDisplayPath(getSkillsPath(source, 'skills'))
  const hasCommandsSkills = skills.some(
    s => s.loadedFrom === 'commands_DEPRECATED',
  )
  return hasCommandsSkills
    ? `${skillsPath}, ${getDisplayPath(getSkillsPath(source, 'commands'))}`
    : skillsPath
}

export function SkillsMenu({ onExit, commands }: Props): React.ReactNode {
  // Filter commands for skills and cast to SkillCommand
  const skills = useMemo(() => {
    return commands.filter(
      (cmd): cmd is SkillCommand =>
        cmd.type === 'prompt' &&
        (cmd.loadedFrom === 'skills' ||
          cmd.loadedFrom === 'commands_DEPRECATED' ||
          cmd.loadedFrom === 'plugin' ||
          cmd.loadedFrom === 'mcp'),
    )
  }, [commands])

  const skillsBySource = useMemo((): Record<SkillSource, SkillCommand[]> => {
    const groups: Record<SkillSource, SkillCommand[]> = {
      policySettings: [],
      userSettings: [],
      projectSettings: [],
      localSettings: [],
      flagSettings: [],
      plugin: [],
      mcp: [],
    }

    for (const skill of skills) {
      const source = skill.source as SkillSource
      if (source in groups) {
        groups[source].push(skill)
      }
    }

    for (const group of Object.values(groups)) {
      group.sort((a, b) => getCommandName(a).localeCompare(getCommandName(b)))
    }

    return groups
  }, [skills])

  const handleCancel = (): void => {
    onExit('Skills dialog dismissed', { display: 'system' })
  }

  if (skills.length === 0) {
    return (
      <Dialog
        title="Skills"
        subtitle="No skills found"
        onCancel={handleCancel}
        hideInputGuide
      >
        <Text dimColor>
          Create skills in .claude/skills/ or ~/.claude/skills/
        </Text>
        <Text dimColor italic>
          <ConfigurableShortcutHint
            action="confirm:no"
            context="Confirmation"
            fallback="Esc"
            description="close"
          />
        </Text>
      </Dialog>
    )
  }

  const getScopeTag = (
    source: SkillSource,
  ): { label: string; color: string } | undefined => {
    switch (source) {
      case 'projectSettings':
      case 'localSettings':
        return { label: 'local', color: 'yellow' }
      case 'userSettings':
        return { label: 'global', color: 'cyan' }
      case 'policySettings':
        return { label: 'managed', color: 'magenta' }
      default:
        return undefined
    }
  }

  const renderSkill = (skill: SkillCommand) => {
    const estimatedTokens = estimateSkillFrontmatterTokens(skill)
    const tokenDisplay = `~${formatTokens(estimatedTokens)}`
    const pluginName =
      skill.source === 'plugin'
        ? skill.pluginInfo?.pluginManifest.name
        : undefined
    const scopeTag = getScopeTag(skill.source as SkillSource)

    return (
      <Box key={`${skill.name}-${skill.source}`}>
        <Text>{getCommandName(skill)}</Text>
        {scopeTag && (
          <Text color={scopeTag.color}> [{scopeTag.label}]</Text>
        )}
        <Text dimColor>
          {pluginName ? ` · ${pluginName}` : ''} · {tokenDisplay} description
          tokens
        </Text>
      </Box>
    )
  }

  const renderSkillGroup = (source: SkillSource) => {
    const groupSkills = skillsBySource[source]
    if (groupSkills.length === 0) return null

    const title = getSourceTitle(source)
    const subtitle = getSourceSubtitle(source, groupSkills)

    return (
      <Box flexDirection="column" key={source}>
        <Box>
          <Text bold dimColor>
            {title}
          </Text>
          {subtitle && <Text dimColor> ({subtitle})</Text>}
        </Box>
        {groupSkills.map(skill => renderSkill(skill))}
      </Box>
    )
  }

  return (
    <Dialog
      title="Skills"
      subtitle={`${skills.length} ${plural(skills.length, 'skill')}`}
      onCancel={handleCancel}
      hideInputGuide
    >
      <Box flexDirection="column" gap={1}>
        {renderSkillGroup('projectSettings')}
        {renderSkillGroup('localSettings')}
        {renderSkillGroup('userSettings')}
        {renderSkillGroup('flagSettings')}
        {renderSkillGroup('policySettings')}
        {renderSkillGroup('plugin')}
        {renderSkillGroup('mcp')}
      </Box>
      <Text dimColor italic>
        <ConfigurableShortcutHint
          action="confirm:no"
          context="Confirmation"
          fallback="Esc"
          description="close"
        />
      </Text>
    </Dialog>
  )
}
