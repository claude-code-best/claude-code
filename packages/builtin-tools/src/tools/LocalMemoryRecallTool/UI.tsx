import * as React from 'react';
import { Text } from '@anthropic/ink';
import { MessageResponse } from 'src/components/MessageResponse.js';
import { OutputLine } from 'src/components/shell/OutputLine.js';
import type { ToolProgressData } from 'src/Tool.js';
import type { ProgressMessage } from 'src/types/message.js';
import { jsonStringify } from 'src/utils/slowOperations.js';
import type { Output } from './LocalMemoryRecallTool.js';

// H6 fix: second `options` parameter matches Tool interface contract
// (theme/verbose/commands). We don't currently differentiate based on
// verbose, but accepting the parameter keeps the function signature
// compatible with the framework.
export function renderToolUseMessage(
  input: Partial<{
    action?: 'list_stores' | 'list_entries' | 'fetch';
    store?: string;
    key?: string;
    preview_only?: boolean;
  }>,
  _options: {
    theme?: unknown;
    verbose?: boolean;
    commands?: unknown;
  } = {},
): React.ReactNode {
  void _options;
  const action = input.action ?? 'list_stores';
  const store = input.store ? ` ${input.store}` : '';
  const key = input.key ? `/${input.key}` : '';
  const preview = action === 'fetch' && input.preview_only === false ? ' (full)' : '';
  return `${action}${store}${key}${preview}`;
}

export function renderToolResultMessage(
  output: Output,
  _progressMessagesForMessage: ProgressMessage<ToolProgressData>[],
  { verbose }: { verbose: boolean },
): React.ReactNode {
  if (output.error) {
    return (
      <MessageResponse height={1}>
        <Text color="error">Error: {output.error}</Text>
      </MessageResponse>
    );
  }

  if (output.action === 'list_stores') {
    if (!output.stores || output.stores.length === 0) {
      return (
        <MessageResponse height={1}>
          <Text dimColor>(No stores)</Text>
        </MessageResponse>
      );
    }
    return (
      <MessageResponse height={Math.min(output.stores.length, 10)}>
        <Text>Stores: {output.stores.join(', ')}</Text>
      </MessageResponse>
    );
  }

  if (output.action === 'list_entries') {
    if (!output.entries || output.entries.length === 0) {
      return (
        <MessageResponse height={1}>
          <Text dimColor>(No entries in {output.store ?? '?'})</Text>
        </MessageResponse>
      );
    }
    return (
      <MessageResponse height={Math.min(output.entries.length, 10)}>
        <Text>
          {output.store}: {output.entries.join(', ')}
        </Text>
      </MessageResponse>
    );
  }

  // fetch
  // eslint-disable-next-line no-restricted-syntax -- human-facing UI, not tool_result
  const formattedOutput = jsonStringify(output, null, 2);
  return <OutputLine content={formattedOutput} verbose={verbose} />;
}
