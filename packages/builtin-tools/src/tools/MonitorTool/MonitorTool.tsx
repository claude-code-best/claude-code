import React from 'react';
import { Text } from '@anthropic/ink';
import { z } from 'zod/v4';
import { TOOL_SUMMARY_MAX_LENGTH } from 'src/constants/toolLimits.js';
import type { ToolResultBlockParam, ToolUseContext, ValidationResult } from 'src/Tool.js';
import { buildTool } from 'src/Tool.js';
import { spawnShellTask } from 'src/tasks/LocalShellTask/LocalShellTask.js';
import { bashToolHasPermission } from '../BashTool/bashPermissions.js';
import type { PermissionResult } from 'src/utils/permissions/PermissionResult.js';
import { lazySchema } from 'src/utils/lazySchema.js';
import { truncate } from 'src/utils/format.js';
import { exec } from 'src/utils/Shell.js';
import { getTaskOutputPath } from 'src/utils/task/diskOutput.js';
import { logEvent } from 'src/services/analytics/index.js';

const MONITOR_TOOL_NAME = 'Monitor';

const inputSchema = lazySchema(() =>
  z.strictObject({
    command: z
      .string()
      .describe(
        'The shell command to run as a long-running monitor. Should produce streaming output (e.g., tail -f, watch, polling loops).',
      ),
    description: z
      .string()
      .describe(
        'Clear, concise description of what this monitor watches. Used as the label in the background tasks UI.',
      ),
  }),
);
type InputSchema = ReturnType<typeof inputSchema>;
export type MonitorInput = z.infer<InputSchema>;

const outputSchema = lazySchema(() =>
  z.object({
    taskId: z.string(),
    outputFile: z.string(),
  }),
);
type OutputSchema = ReturnType<typeof outputSchema>;
export type MonitorOutput = z.infer<OutputSchema>;

export const MonitorTool = buildTool({
  name: MONITOR_TOOL_NAME,
  searchHint: 'start long-running background monitor for streaming events',
  maxResultSizeChars: 10_000,
  strict: true,

  get inputSchema(): InputSchema {
    return inputSchema();
  },
  get outputSchema(): OutputSchema {
    return outputSchema();
  },

  async description() {
    return 'Start a long-running background monitor';
  },
  async prompt() {
    return `Use Monitor to start a long-running background process that streams output (watching logs, polling APIs, tailing files, etc.). The command runs in the background and you receive a notification when it exits. Use the Read tool with the output file path to check its output at any time.

Guidelines:
- Use Monitor for commands that produce ongoing streaming output: \`tail -f\`, log watchers, file watchers, API polling loops, \`watch\` commands
- Do NOT use Monitor for one-shot commands that finish quickly — use Bash for those
- Do NOT use Monitor for commands that need interactive input — they will hang
- The description should clearly explain what is being monitored
- You'll get a task notification when the monitor process exits (stream ends, script fails, or killed)
- To check output at any time, use Read on the output file path returned by this tool

Examples:
- Watching a log file: command="tail -f /var/log/app.log", description="Watch app log for errors"
- Polling an API: command="while true; do curl -s http://localhost:3000/health; sleep 5; done", description="Poll health endpoint every 5s"
- Watching for file changes: command="inotifywait -m -r ./src", description="Watch src directory for file changes"`;
  },

  isConcurrencySafe() {
    return true;
  },

  isReadOnly() {
    // Monitor executes shell commands which may have side effects
    return false;
  },

  toAutoClassifierInput(input: MonitorInput) {
    return `Monitor: ${input.command}`;
  },

  async checkPermissions(input: MonitorInput, context: ToolUseContext): Promise<PermissionResult> {
    // Reuse bash permission checking for the underlying command
    return bashToolHasPermission({ command: input.command }, context);
  },

  userFacingName() {
    return MONITOR_TOOL_NAME;
  },

  getActivityDescription(input: MonitorInput) {
    if (!input?.description) {
      return 'Starting monitor';
    }
    return `Monitoring: ${truncate(input.description, TOOL_SUMMARY_MAX_LENGTH)}`;
  },

  async validateInput(input: MonitorInput): Promise<ValidationResult> {
    if (!input.command || input.command.trim() === '') {
      return {
        result: false,
        message: 'Monitor command cannot be empty.',
        errorCode: 1,
      };
    }
    if (!input.description || input.description.trim() === '') {
      return {
        result: false,
        message: 'Monitor description cannot be empty.',
        errorCode: 2,
      };
    }
    return { result: true };
  },

  async call(input: MonitorInput, context: ToolUseContext) {
    const { command, description } = input;
    const { abortController, setAppState, toolUseId, agentId } = context;

    logEvent('tengu_monitor_tool_used', {});

    // Create the shell command via exec
    const shellCommand = await exec(command, abortController.signal, 'bash');

    // Spawn as a background task with kind: 'monitor'
    const handle = await spawnShellTask(
      {
        command,
        description,
        shellCommand,
        toolUseId: toolUseId,
        agentId,
        kind: 'monitor',
      },
      {
        abortController,
        getAppState: context.getAppState,
        setAppState,
      },
    );

    const outputFile = getTaskOutputPath(handle.taskId);

    return {
      data: {
        taskId: handle.taskId,
        outputFile,
      },
    };
  },

  renderToolUseMessage(input: MonitorInput, { verbose }) {
    const desc = truncate(input.description || input.command, 80);
    return `Monitor: ${desc}`;
  },

  mapToolResultToToolResultBlockParam(content: MonitorOutput, toolUseId: string): ToolResultBlockParam {
    return {
      tool_use_id: toolUseId,
      type: 'tool_result',
      content: `Monitor started (task ${content.taskId}). Output file: ${content.outputFile}`,
    };
  },

  renderToolResultMessage(output: MonitorOutput) {
    return (
      <Text>
        Monitor started (task {output.taskId}). Output: {output.outputFile}
      </Text>
    );
  },
});
