import React from 'react';
import { Box, Text } from '@anthropic/ink';
import type { Theme } from '@anthropic/ink';
import type { Skill, SkillVersion } from './skillsApi.js';

type Props =
  | { mode: 'list'; skills: Skill[] }
  | { mode: 'detail'; skill: Skill }
  | { mode: 'versions'; id: string; versions: SkillVersion[] }
  | { mode: 'version-detail'; version: SkillVersion }
  | { mode: 'created'; skill: Skill }
  | { mode: 'deleted'; id: string }
  | { mode: 'installed'; skillName: string; path: string }
  | { mode: 'error'; message: string };

function SkillRow({ skill }: { skill: Skill }): React.ReactNode {
  const createdAt = skill.created_at ? new Date(skill.created_at).toLocaleString() : '—';
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold>{skill.skill_id}</Text>
        <Text dimColor> · </Text>
        <Text>{skill.name}</Text>
        {skill.deprecated ? (
          <>
            <Text dimColor> · </Text>
            <Text color={'warning' as keyof Theme}>deprecated</Text>
          </>
        ) : null}
      </Box>
      <Text dimColor>
        Owner: {skill.owner}
        {skill.owner_symbol ? ` (${skill.owner_symbol})` : ''}
      </Text>
      <Text dimColor>Created: {createdAt}</Text>
    </Box>
  );
}

export function SkillStoreView(props: Props): React.ReactNode {
  if (props.mode === 'list') {
    if (props.skills.length === 0) {
      return (
        <Box>
          <Text dimColor>No skills found. Use /skill-store create &lt;name&gt; &lt;markdown&gt; to publish one.</Text>
        </Box>
      );
    }
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>Skills ({props.skills.length})</Text>
        </Box>
        {props.skills.map(skill => (
          <SkillRow key={skill.skill_id} skill={skill} />
        ))}
      </Box>
    );
  }

  if (props.mode === 'detail') {
    const { skill } = props;
    const createdAt = skill.created_at ? new Date(skill.created_at).toLocaleString() : '—';
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>Skill: {skill.skill_id}</Text>
        </Box>
        <Text>Name: {skill.name}</Text>
        <Text>
          Owner: {skill.owner}
          {skill.owner_symbol ? ` (${skill.owner_symbol})` : ''}
        </Text>
        <Text>
          Status:{' '}
          <Text color={(skill.deprecated ? 'warning' : 'success') as keyof Theme}>
            {skill.deprecated ? 'deprecated' : 'active'}
          </Text>
        </Text>
        {skill.allowed_tools && skill.allowed_tools.length > 0 ? (
          <Text>Allowed tools: {skill.allowed_tools.join(', ')}</Text>
        ) : null}
        <Text dimColor>Created: {createdAt}</Text>
      </Box>
    );
  }

  if (props.mode === 'versions') {
    const { id, versions } = props;
    if (versions.length === 0) {
      return (
        <Box>
          <Text dimColor>No versions found for skill {id}.</Text>
        </Box>
      );
    }
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>
            Versions for {id} ({versions.length})
          </Text>
        </Box>
        {versions.map(ver => {
          const createdAt = ver.created_at ? new Date(ver.created_at).toLocaleString() : '—';
          return (
            <Box key={ver.version} flexDirection="column" marginBottom={1}>
              <Text bold>{ver.version}</Text>
              <Text dimColor>Created: {createdAt}</Text>
              <Text dimColor>{ver.body.length > 80 ? `${ver.body.slice(0, 80)}…` : ver.body}</Text>
            </Box>
          );
        })}
      </Box>
    );
  }

  if (props.mode === 'version-detail') {
    const { version } = props;
    const createdAt = version.created_at ? new Date(version.created_at).toLocaleString() : '—';
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>
            Version: {version.version} (skill: {version.skill_id})
          </Text>
        </Box>
        <Text dimColor>Created: {createdAt}</Text>
        <Box marginTop={1}>
          <Text>{version.body}</Text>
        </Box>
      </Box>
    );
  }

  if (props.mode === 'created') {
    const { skill } = props;
    return (
      <Box flexDirection="column">
        <Box>
          <Text bold color={'success' as keyof Theme}>
            Skill created
          </Text>
        </Box>
        <Text>ID: {skill.skill_id}</Text>
        <Text>Name: {skill.name}</Text>
      </Box>
    );
  }

  if (props.mode === 'deleted') {
    return (
      <Box>
        <Text color={'success' as keyof Theme}>Skill {props.id} deleted.</Text>
      </Box>
    );
  }

  if (props.mode === 'installed') {
    return (
      <Box flexDirection="column">
        <Box>
          <Text bold color={'success' as keyof Theme}>
            Skill installed
          </Text>
        </Box>
        <Text>Name: {props.skillName}</Text>
        <Text dimColor>Path: {props.path}</Text>
        <Text dimColor>Load with: /skills (bundled skills are not auto-loaded; place in {props.path})</Text>
      </Box>
    );
  }

  // error mode
  return (
    <Box>
      <Text color={'error' as keyof Theme}>{props.message}</Text>
    </Box>
  );
}
