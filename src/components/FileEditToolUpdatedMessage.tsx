import * as React from 'react';
import { Text } from '@anthropic/ink';
import { count } from '../utils/array.js';
import { MessageResponse } from './MessageResponse.js';

type Props = {
  filePath: string;
  structuredPatch: { lines: string[] }[];
  style?: 'condensed';
  verbose: boolean;
  previewHint?: string;
};

export function FileEditToolUpdatedMessage({
  filePath,
  structuredPatch,
  style,
  verbose,
  previewHint,
}: Props): React.ReactNode {
  const numAdditions = structuredPatch.reduce((acc, hunk) => acc + count(hunk.lines, _ => _.startsWith('+')), 0);
  const numRemovals = structuredPatch.reduce((acc, hunk) => acc + count(hunk.lines, _ => _.startsWith('-')), 0);

  const text = (
    <Text>
      {numAdditions > 0 ? (
        <>
          Added <Text bold>{numAdditions}</Text> {numAdditions > 1 ? 'lines' : 'line'}
        </>
      ) : null}
      {numAdditions > 0 && numRemovals > 0 ? ', ' : null}
      {numRemovals > 0 ? (
        <>
          {numAdditions === 0 ? 'R' : 'r'}emoved <Text bold>{numRemovals}</Text> {numRemovals > 1 ? 'lines' : 'line'}
        </>
      ) : null}
    </Text>
  );

  // Plan files: invert condensed behavior
  // - Regular mode: just show the hint (user can type /plan to see full content)
  // - Condensed mode (subagent view): show the text
  if (previewHint) {
    if (style !== 'condensed' && !verbose) {
      return (
        <MessageResponse>
          <Text dimColor>{previewHint}</Text>
        </MessageResponse>
      );
    }
  } else if (style === 'condensed' && !verbose) {
    return text;
  }

  return <MessageResponse>{text}</MessageResponse>;
}
