/**
 * UserCrossSessionMessage — render a message received from another Claude session
 * via UDS_INBOX (SendMessage tool).
 */
import type { TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs';
import * as React from 'react';
import { Box, Text } from '@anthropic/ink';
import { extractTag } from '../../utils/messages.js';

type Props = {
  addMargin: boolean;
  param: TextBlockParam;
  /**
   * Expanded state (official 2.1.330 `MM` component, L936598:
   * `expanded = YK(verbose, isTranscriptMode)`): verbose or transcript
   * (ctrl+o) mode renders the message expanded — header without the `@`
   * and the expand hint, body wrapped.
   */
  isExpanded?: boolean;
  /**
   * Consecutive message from the same sender (official `MM`): the
   * `› Message from …` header is not repeated — the body renders directly.
   */
  followsSpeakerLabel?: boolean;
};

export function UserCrossSessionMessage({
  param,
  addMargin,
  isExpanded = false,
  followsSpeakerLabel = false,
}: Props): React.ReactNode {
  const text = param.text;
  const extracted = extractTag(text, 'cross-session-message');
  if (!extracted) {
    return null;
  }

  const fromMatch = text.match(/from="([^"]*)"/);
  const from = fromMatch?.[1] ?? 'another session';

  // Official 2.1.330 (m60, tmux-verified): an agent messaging the main
  // session renders as
  //
  //   collapsed: `› Message from @general-purpose (ctrl+o to expand)` — dim
  //   source line (ctrl+o opens the transcript view) with the content below
  //   it (not wrapped — long lines truncate at the terminal edge).
  //   expanded (verbose / transcript mode): `› Message from general-purpose`
  //   — no `@`, no expand hint — with the wrapped content below it.
  //
  // `followsSpeakerLabel`: consecutive messages from the same sender don't
  // repeat the header at all — the body renders directly (applies in both
  // collapsed and expanded form).
  if (followsSpeakerLabel) {
    return (
      <Box flexDirection="column" marginTop={addMargin ? 1 : 0}>
        <Text wrap={isExpanded ? 'wrap' : undefined}>{extracted}</Text>
      </Box>
    );
  }

  if (isExpanded) {
    return (
      <Box flexDirection="column" marginTop={addMargin ? 1 : 0}>
        <Text dimColor>› Message from {from}</Text>
        <Text wrap="wrap">{extracted}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={addMargin ? 1 : 0}>
      <Text dimColor>› Message from @{from} (ctrl+o to expand)</Text>
      <Text>{extracted}</Text>
    </Box>
  );
}
