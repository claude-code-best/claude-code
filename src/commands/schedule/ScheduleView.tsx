import React from 'react';
import { Box, Text } from '@anthropic/ink';
import type { Theme } from '@anthropic/ink';
import type { Trigger } from './triggersApi.js';
import { cronToHuman } from '../../utils/cron.js';

type Props =
  | { mode: 'list'; triggers: Trigger[] }
  | { mode: 'detail'; trigger: Trigger }
  | { mode: 'created'; trigger: Trigger }
  | { mode: 'updated'; trigger: Trigger }
  | { mode: 'deleted'; id: string }
  | { mode: 'ran'; id: string; runId: string }
  | { mode: 'enabled'; id: string }
  | { mode: 'disabled'; id: string }
  | { mode: 'error'; message: string };

function TriggerRow({ trigger }: { trigger: Trigger }): React.ReactNode {
  const schedule = cronToHuman(trigger.cron_expression, { utc: true });
  const nextRun = trigger.next_run ? new Date(trigger.next_run).toLocaleString() : '—';
  const enabledText = trigger.enabled ? 'enabled' : 'disabled';
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold>{trigger.trigger_id}</Text>
        <Text dimColor> · </Text>
        <Text color={(trigger.enabled ? 'success' : 'warning') as keyof Theme}>{enabledText}</Text>
        {trigger.agent_id ? (
          <>
            <Text dimColor> · agent: </Text>
            <Text>{trigger.agent_id}</Text>
          </>
        ) : null}
      </Box>
      <Text>Schedule: {schedule}</Text>
      <Text dimColor>Prompt: {trigger.prompt}</Text>
      <Text dimColor>Next run: {nextRun}</Text>
    </Box>
  );
}

export function ScheduleView(props: Props): React.ReactNode {
  if (props.mode === 'list') {
    if (props.triggers.length === 0) {
      return (
        <Box>
          <Text dimColor>No scheduled triggers. Use /schedule create &lt;cron&gt; &lt;prompt&gt; to create one.</Text>
        </Box>
      );
    }
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>Scheduled Triggers ({props.triggers.length})</Text>
        </Box>
        {props.triggers.map(trigger => (
          <TriggerRow key={trigger.trigger_id} trigger={trigger} />
        ))}
      </Box>
    );
  }

  if (props.mode === 'detail') {
    const { trigger } = props;
    const schedule = cronToHuman(trigger.cron_expression, { utc: true });
    const nextRun = trigger.next_run ? new Date(trigger.next_run).toLocaleString() : '—';
    const lastRun = trigger.last_run ? new Date(trigger.last_run).toLocaleString() : '—';
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>Trigger: {trigger.trigger_id}</Text>
        </Box>
        <Text>
          Status:{' '}
          <Text color={(trigger.enabled ? 'success' : 'warning') as keyof Theme}>
            {trigger.enabled ? 'enabled' : 'disabled'}
          </Text>
        </Text>
        <Text>Schedule: {schedule}</Text>
        {trigger.agent_id ? <Text>Agent: {trigger.agent_id}</Text> : null}
        <Text>Next run: {nextRun}</Text>
        <Text dimColor>Last run: {lastRun}</Text>
        <Text dimColor>Prompt: {trigger.prompt}</Text>
        {trigger.created_at ? <Text dimColor>Created: {new Date(trigger.created_at).toLocaleString()}</Text> : null}
      </Box>
    );
  }

  if (props.mode === 'created') {
    const { trigger } = props;
    const schedule = cronToHuman(trigger.cron_expression, { utc: true });
    return (
      <Box flexDirection="column">
        <Box>
          <Text bold color={'success' as keyof Theme}>
            Trigger created
          </Text>
        </Box>
        <Text>ID: {trigger.trigger_id}</Text>
        <Text>Schedule: {schedule}</Text>
        <Text>Prompt: {trigger.prompt}</Text>
        {trigger.agent_id ? <Text>Agent: {trigger.agent_id}</Text> : null}
        <Text dimColor>Status: {trigger.enabled ? 'enabled' : 'disabled'}</Text>
      </Box>
    );
  }

  if (props.mode === 'updated') {
    const { trigger } = props;
    return (
      <Box flexDirection="column">
        <Box>
          <Text bold color={'success' as keyof Theme}>
            Trigger updated
          </Text>
        </Box>
        <Text>ID: {trigger.trigger_id}</Text>
        <Text dimColor>Status: {trigger.enabled ? 'enabled' : 'disabled'}</Text>
      </Box>
    );
  }

  if (props.mode === 'deleted') {
    return (
      <Box>
        <Text color={'success' as keyof Theme}>Trigger {props.id} deleted.</Text>
      </Box>
    );
  }

  if (props.mode === 'ran') {
    return (
      <Box flexDirection="column">
        <Box>
          <Text color={'success' as keyof Theme}>Trigger {props.id} fired.</Text>
        </Box>
        <Text dimColor>Run ID: {props.runId}</Text>
      </Box>
    );
  }

  if (props.mode === 'enabled') {
    return (
      <Box>
        <Text color={'success' as keyof Theme}>Trigger {props.id} enabled.</Text>
      </Box>
    );
  }

  if (props.mode === 'disabled') {
    return (
      <Box>
        <Text color={'warning' as keyof Theme}>Trigger {props.id} disabled.</Text>
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
