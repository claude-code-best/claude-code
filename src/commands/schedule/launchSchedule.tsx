import React from 'react';
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js';
import { parseCronExpression } from '../../utils/cron.js';
import type { LocalJSXCommandCall } from '../../types/command.js';
import { createTrigger, deleteTrigger, getTrigger, listTriggers, runTrigger, updateTrigger } from './triggersApi.js';
import { ScheduleView } from './ScheduleView.js';
import { parseScheduleArgs } from './parseArgs.js';
import type { UpdateTriggerBody } from './triggersApi.js';

export const callSchedule: LocalJSXCommandCall = async (onDone, _context, args) => {
  logEvent('tengu_schedule_started', {
    args: (args ?? '') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  });

  const parsed = parseScheduleArgs(args ?? '');

  // ── invalid args ──────────────────────────────────────────────────────────
  if (parsed.action === 'invalid') {
    logEvent('tengu_schedule_failed', {
      reason: parsed.reason as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });
    onDone(
      `Usage: /schedule list | get ID | create CRON PROMPT | update ID FIELD VALUE | delete ID | run ID | enable ID | disable ID\n${parsed.reason}`,
      { display: 'system' },
    );
    return null;
  }

  // ── list ──────────────────────────────────────────────────────────────────
  if (parsed.action === 'list') {
    logEvent('tengu_schedule_list', {});
    try {
      const triggers = await listTriggers();
      onDone(triggers.length === 0 ? 'No scheduled triggers found.' : `${triggers.length} scheduled trigger(s).`, {
        display: 'system',
      });
      return React.createElement(ScheduleView, { mode: 'list', triggers });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logEvent('tengu_schedule_failed', {
        reason: msg as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });
      onDone(`Failed to list triggers: ${msg}`, { display: 'system' });
      return React.createElement(ScheduleView, { mode: 'error', message: msg });
    }
  }

  // ── get ───────────────────────────────────────────────────────────────────
  if (parsed.action === 'get') {
    const { id } = parsed;
    logEvent('tengu_schedule_get', {
      id: id as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });
    try {
      const trigger = await getTrigger(id);
      onDone(`Trigger ${id} fetched.`, { display: 'system' });
      return React.createElement(ScheduleView, { mode: 'detail', trigger });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logEvent('tengu_schedule_failed', {
        reason: msg as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });
      onDone(`Failed to get trigger ${id}: ${msg}`, { display: 'system' });
      return React.createElement(ScheduleView, { mode: 'error', message: msg });
    }
  }

  // ── create ────────────────────────────────────────────────────────────────
  if (parsed.action === 'create') {
    const { cron, prompt } = parsed;

    const cronFields = parseCronExpression(cron);
    if (!cronFields) {
      const reason = `Invalid cron expression: "${cron}". Expected 5 fields (minute hour day month weekday).`;
      logEvent('tengu_schedule_failed', {
        reason: reason as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });
      onDone(reason, { display: 'system' });
      return null;
    }

    logEvent('tengu_schedule_create', {
      cron: cron as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });
    try {
      const trigger = await createTrigger({ cron_expression: cron, prompt });
      onDone(`Trigger created: ${trigger.trigger_id}`, { display: 'system' });
      return React.createElement(ScheduleView, { mode: 'created', trigger });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logEvent('tengu_schedule_failed', {
        reason: msg as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });
      onDone(`Failed to create trigger: ${msg}`, { display: 'system' });
      return React.createElement(ScheduleView, { mode: 'error', message: msg });
    }
  }

  // ── update ────────────────────────────────────────────────────────────────
  if (parsed.action === 'update') {
    const { id, field, value } = parsed;
    logEvent('tengu_schedule_update', {
      id: id as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      field: field as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });

    // Coerce value to boolean when field is 'enabled'
    let body: UpdateTriggerBody = {};
    if (field === 'enabled') {
      body = { enabled: value === 'true' || value === '1' };
    } else if (field === 'cron_expression' || field === 'cron') {
      body = { cron_expression: value };
    } else if (field === 'prompt') {
      body = { prompt: value };
    } else if (field === 'agent_id') {
      body = { agent_id: value };
    } else {
      const reason = `Unknown field "${field}". Valid fields: enabled, cron_expression, prompt, agent_id`;
      logEvent('tengu_schedule_failed', {
        reason: reason as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });
      onDone(reason, { display: 'system' });
      return React.createElement(ScheduleView, {
        mode: 'error',
        message: reason,
      });
    }

    try {
      const trigger = await updateTrigger(id, body);
      onDone(`Trigger ${id} updated.`, { display: 'system' });
      return React.createElement(ScheduleView, { mode: 'updated', trigger });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logEvent('tengu_schedule_failed', {
        reason: msg as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });
      onDone(`Failed to update trigger ${id}: ${msg}`, { display: 'system' });
      return React.createElement(ScheduleView, { mode: 'error', message: msg });
    }
  }

  // ── delete ────────────────────────────────────────────────────────────────
  if (parsed.action === 'delete') {
    const { id } = parsed;
    logEvent('tengu_schedule_delete', {
      id: id as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });
    try {
      await deleteTrigger(id);
      onDone(`Trigger ${id} deleted.`, { display: 'system' });
      return React.createElement(ScheduleView, { mode: 'deleted', id });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logEvent('tengu_schedule_failed', {
        reason: msg as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });
      onDone(`Failed to delete trigger ${id}: ${msg}`, { display: 'system' });
      return React.createElement(ScheduleView, { mode: 'error', message: msg });
    }
  }

  // ── run ───────────────────────────────────────────────────────────────────
  if (parsed.action === 'run') {
    const { id } = parsed;
    logEvent('tengu_schedule_run', {
      id: id as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });
    try {
      const result = await runTrigger(id);
      onDone(`Trigger ${id} fired. Run ID: ${result.run_id}`, {
        display: 'system',
      });
      return React.createElement(ScheduleView, {
        mode: 'ran',
        id,
        runId: result.run_id,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logEvent('tengu_schedule_failed', {
        reason: msg as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });
      onDone(`Failed to run trigger ${id}: ${msg}`, { display: 'system' });
      return React.createElement(ScheduleView, { mode: 'error', message: msg });
    }
  }

  // ── enable ────────────────────────────────────────────────────────────────
  if (parsed.action === 'enable') {
    const { id } = parsed;
    logEvent('tengu_schedule_enable', {
      id: id as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });
    try {
      await updateTrigger(id, { enabled: true });
      onDone(`Trigger ${id} enabled.`, { display: 'system' });
      return React.createElement(ScheduleView, { mode: 'enabled', id });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logEvent('tengu_schedule_failed', {
        reason: msg as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });
      onDone(`Failed to enable trigger ${id}: ${msg}`, { display: 'system' });
      return React.createElement(ScheduleView, { mode: 'error', message: msg });
    }
  }

  // ── disable ───────────────────────────────────────────────────────────────
  // parsed.action === 'disable'
  const { id } = parsed;
  logEvent('tengu_schedule_disable', {
    id: id as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  });
  try {
    await updateTrigger(id, { enabled: false });
    onDone(`Trigger ${id} disabled.`, { display: 'system' });
    return React.createElement(ScheduleView, { mode: 'disabled', id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logEvent('tengu_schedule_failed', {
      reason: msg as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });
    onDone(`Failed to disable trigger ${id}: ${msg}`, { display: 'system' });
    return React.createElement(ScheduleView, { mode: 'error', message: msg });
  }
};
