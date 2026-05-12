import * as React from 'react';
import { Text } from '@anthropic/ink';
import { MessageResponse } from 'src/components/MessageResponse.js';
import { OutputLine } from 'src/components/shell/OutputLine.js';
import type { ToolProgressData } from 'src/Tool.js';
import type { ProgressMessage } from 'src/types/message.js';
import { jsonStringify } from 'src/utils/slowOperations.js';
import type { Output } from './VaultHttpFetchTool.js';

// H6 fix: second `options` parameter matches Tool interface contract.
export function renderToolUseMessage(
  input: Partial<{
    method?: string;
    url?: string;
    vault_auth_key?: string;
  }>,
  _options: {
    theme?: unknown;
    verbose?: boolean;
    commands?: unknown;
  } = {},
): React.ReactNode {
  void _options;
  const method = input.method ?? 'GET';
  const key = input.vault_auth_key ?? '?';
  const url = input.url ?? '';
  // Show key NAME (already required to be non-secret); no secret value involved.
  return `${method} ${url} (vault: ${key})`;
}

export function renderToolResultMessage(
  output: Output,
  _progressMessagesForMessage: ProgressMessage<ToolProgressData>[],
  { verbose }: { verbose: boolean },
): React.ReactNode {
  if (output.error) {
    return (
      <MessageResponse height={1}>
        <Text color="error">VaultHttpFetch: {output.error}</Text>
      </MessageResponse>
    );
  }
  // Body has already been scrubbed of secret forms before reaching here;
  // safe to display.
  // eslint-disable-next-line no-restricted-syntax -- human-facing UI, not tool_result
  const formatted = jsonStringify(output, null, 2);
  return <OutputLine content={formatted} verbose={verbose} />;
}
