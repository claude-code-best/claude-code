import React from 'react';
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js';
import { parseCronExpression } from '../../utils/cron.js';
import type { LocalJSXCommandCall, LocalJSXCommandOnDone } from '../../types/command.js';
import { createAgent, deleteAgent, listAgents, runAgent } from './agentsApi.js';
import { AgentsPlatformView } from './AgentsPlatformView.js';
import { parseAgentsPlatformArgs } from './parseArgs.js';
import { launchCommand } from '../_shared/launchCommand.js';

type AgentsPlatformViewProps = React.ComponentProps<typeof AgentsPlatformView>;

async function dispatchAgentsPlatform(
  parsed: ReturnType<typeof parseAgentsPlatformArgs>,
  onDone: LocalJSXCommandOnDone,
): Promise<AgentsPlatformViewProps | null> {
  if (parsed.action === 'list') {
    logEvent('tengu_agents_platform_list', {});
    try {
      const agents = await listAgents();
      onDone(agents.length === 0 ? 'No scheduled agents found.' : `${agents.length} scheduled agent(s).`, {
        display: 'system',
      });
      return { mode: 'list', agents };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logEvent('tengu_agents_platform_failed', {
        reason: msg as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });
      onDone(`Failed to list agents: ${msg}`, { display: 'system' });
      return { mode: 'error', message: msg };
    }
  }

  if (parsed.action === 'create') {
    const { cron, prompt } = parsed;

    // Validate cron expression client-side before hitting the network
    const cronFields = parseCronExpression(cron);
    if (!cronFields) {
      const reason = `Invalid cron expression: "${cron}". Expected 5 fields (minute hour day month weekday).`;
      logEvent('tengu_agents_platform_failed', {
        reason: reason as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });
      onDone(reason, { display: 'system' });
      return null;
    }

    logEvent('tengu_agents_platform_create', {
      cron: cron as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });
    try {
      const agent = await createAgent(cron, prompt);
      onDone(`Agent created: ${agent.id}`, { display: 'system' });
      return { mode: 'created', agent };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logEvent('tengu_agents_platform_failed', {
        reason: msg as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });
      onDone(`Failed to create agent: ${msg}`, { display: 'system' });
      return { mode: 'error', message: msg };
    }
  }

  if (parsed.action === 'delete') {
    const { id } = parsed;
    logEvent('tengu_agents_platform_delete', {
      id: id as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });
    try {
      await deleteAgent(id);
      onDone(`Agent ${id} deleted.`, { display: 'system' });
      return { mode: 'deleted', id };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logEvent('tengu_agents_platform_failed', {
        reason: msg as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });
      onDone(`Failed to delete agent ${id}: ${msg}`, { display: 'system' });
      return { mode: 'error', message: msg };
    }
  }

  // parsed.action === 'run' (all other actions handled above)
  const runParsed = parsed as { action: 'run'; id: string };
  const { id } = runParsed;
  logEvent('tengu_agents_platform_run', {
    id: id as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  });
  try {
    const result = await runAgent(id);
    onDone(`Agent ${id} triggered. Run ID: ${result.run_id}`, { display: 'system' });
    return { mode: 'ran', id, runId: result.run_id };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logEvent('tengu_agents_platform_failed', {
      reason: msg as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });
    onDone(`Failed to run agent ${id}: ${msg}`, { display: 'system' });
    return { mode: 'error', message: msg };
  }
}

export const callAgentsPlatform: LocalJSXCommandCall = launchCommand<
  ReturnType<typeof parseAgentsPlatformArgs>,
  AgentsPlatformViewProps
>({
  commandName: 'agents-platform',
  parseArgs: (raw: string) => {
    logEvent('tengu_agents_platform_started', {
      args: raw as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });
    const result = parseAgentsPlatformArgs(raw);
    if (result.action === 'invalid') {
      logEvent('tengu_agents_platform_failed', {
        reason: result.reason as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });
      return {
        action: 'invalid' as const,
        reason: `Usage: /agents-platform list | create CRON PROMPT | delete ID | run ID\n${result.reason}`,
      };
    }
    return result;
  },
  dispatch: dispatchAgentsPlatform,
  View: AgentsPlatformView,
  // Invalid args returns null to match original behaviour (error already surfaced via onDone)
  errorView: (_msg: string) => null,
});
