import * as React from 'react';
import { Box, Text } from '@anthropic/ink';
import type { OptionWithDescription } from '../../components/CustomSelect/select.js';
import { Select } from '../../components/CustomSelect/select.js';
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js';
import { useAppState, useSetAppState } from '../../state/AppState.js';
import type { ToolPermissionContext } from '../../Tool.js';
import type { LocalJSXCommandOnDone } from '../../types/command.js';
import type { PermissionMode } from '../../utils/permissions/PermissionMode.js';
import {
  getAutoModeUnavailableNotification,
  getAutoModeUnavailableReason,
  isBypassPermissionsModeDisabled,
  transitionPermissionMode,
} from '../../utils/permissions/permissionSetup.js';
import {
  APPROVAL_MODE_DESCRIPTORS,
  formatApprovalMode,
  getApprovalModeDescriptor,
  parseApprovalModeArg,
} from './approvalModes.js';

type ApprovalCommandResult = {
  message: string;
  modeUpdate?: PermissionMode;
};

function getModeUnavailableMessage(mode: PermissionMode, context: ToolPermissionContext): string | undefined {
  if (mode === 'bypassPermissions') {
    if (isBypassPermissionsModeDisabled()) {
      return 'Full access is disabled by settings or organization policy.';
    }
    if (!context.isBypassPermissionsModeAvailable) {
      return 'Full access is not available in this session. Start ccb with --allow-dangerously-skip-permissions to make it selectable, or --dangerously-skip-permissions to start directly in full access mode.';
    }
  }

  if (mode === 'auto') {
    const reason = getAutoModeUnavailableReason();
    if (reason) {
      return `Auto approval is unavailable: ${getAutoModeUnavailableNotification(reason)}`;
    }
  }

  return undefined;
}

function applyApprovalMode(context: ToolPermissionContext, mode: PermissionMode): ApprovalCommandResult {
  const unavailableMessage = getModeUnavailableMessage(mode, context);
  if (unavailableMessage) {
    return { message: unavailableMessage };
  }

  if (context.mode === mode) {
    return { message: `Approval mode is already ${formatApprovalMode(mode)}.` };
  }

  logEvent('tengu_approval_command', {
    mode: mode as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  });

  const descriptor = getApprovalModeDescriptor(mode);
  return {
    message: `Approval mode set to ${formatApprovalMode(mode)}: ${descriptor.description}`,
    modeUpdate: mode,
  };
}

function applyModeUpdate(context: ToolPermissionContext, mode: PermissionMode): ToolPermissionContext {
  const next = transitionPermissionMode(context.mode, mode, context);
  return { ...next, mode };
}

export function showCurrentApprovalMode(context: ToolPermissionContext): ApprovalCommandResult {
  const descriptor = getApprovalModeDescriptor(context.mode);
  return {
    message: `Current approval mode: ${formatApprovalMode(context.mode)} (${descriptor.description})`,
  };
}

export function executeApproval(args: string, context: ToolPermissionContext): ApprovalCommandResult {
  const parsed = parseApprovalModeArg(args);
  switch (parsed.type) {
    case 'current':
      return showCurrentApprovalMode(context);
    case 'help':
      return {
        message: formatApprovalHelp(),
      };
    case 'mode':
      return applyApprovalMode(context, parsed.mode);
    case 'invalid':
      return { message: parsed.message };
  }
}

function formatApprovalHelp(): string {
  const aliases = APPROVAL_MODE_DESCRIPTORS.map(descriptor => descriptor.aliases[0]).join('|');
  const modes = APPROVAL_MODE_DESCRIPTORS.map(
    descriptor => `- ${descriptor.aliases[0]}: ${descriptor.description}`,
  ).join('\n');
  return `Usage: /approval [${aliases}]\n\nApproval modes:\n${modes}`;
}

function ApplyApprovalAndClose({
  result,
  onDone,
}: {
  result: ApprovalCommandResult;
  onDone: (result: string) => void;
}): React.ReactNode {
  const setAppState = useSetAppState();
  const { message, modeUpdate } = result;
  React.useEffect(() => {
    if (modeUpdate) {
      setAppState(prev => ({
        ...prev,
        toolPermissionContext: applyModeUpdate(prev.toolPermissionContext, modeUpdate),
      }));
    }
    onDone(message);
  }, [setAppState, message, modeUpdate, onDone]);
  return null;
}

function ApprovalPicker({ onDone }: { onDone: (result: string) => void }): React.ReactNode {
  const toolPermissionContext = useAppState(s => s.toolPermissionContext);
  const setAppState = useSetAppState();

  const options: OptionWithDescription<PermissionMode>[] = APPROVAL_MODE_DESCRIPTORS.map(descriptor => {
    const unavailableMessage = getModeUnavailableMessage(descriptor.mode, toolPermissionContext);
    return {
      label: descriptor.label,
      value: descriptor.mode,
      description:
        descriptor.mode === toolPermissionContext.mode
          ? `${descriptor.description} (current)`
          : (unavailableMessage ?? descriptor.description),
      disabled: unavailableMessage !== undefined,
    };
  });

  function handleSelect(mode: PermissionMode): void {
    const result = applyApprovalMode(toolPermissionContext, mode);
    if (result.modeUpdate) {
      setAppState(prev => ({
        ...prev,
        toolPermissionContext: applyModeUpdate(prev.toolPermissionContext, result.modeUpdate!),
      }));
    }
    onDone(result.message);
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Text>Select approval mode</Text>
      <Select
        options={options}
        defaultValue={toolPermissionContext.mode}
        defaultFocusValue={toolPermissionContext.mode}
        onChange={handleSelect}
        onCancel={() => onDone('Approval mode unchanged.')}
        visibleOptionCount={6}
      />
    </Box>
  );
}

export async function call(onDone: LocalJSXCommandOnDone, _context: unknown, args?: string): Promise<React.ReactNode> {
  args = args?.trim() || '';

  if (!args) {
    return <ApprovalPicker onDone={onDone} />;
  }
  return <ApprovalCommandWithArgs args={args} onDone={onDone} />;
}

function ApprovalCommandWithArgs({
  args,
  onDone,
}: {
  args: string;
  onDone: (result: string) => void;
}): React.ReactNode {
  const toolPermissionContext = useAppState(s => s.toolPermissionContext);
  const result = executeApproval(args, toolPermissionContext);
  return <ApplyApprovalAndClose result={result} onDone={onDone} />;
}
