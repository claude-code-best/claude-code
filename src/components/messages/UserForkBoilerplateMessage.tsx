/**
 * UserForkBoilerplateMessage — render the fork/subagent boilerplate directive.
 */
import type { TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs';
import * as React from 'react';
import { FORK_BOILERPLATE_TAG, FORK_DIRECTIVE_PREFIX } from '../../constants/xml.js';
import { extractTag } from '../../utils/messages.js';
import { UserPromptMessage } from './UserPromptMessage.js';

type Props = {
  addMargin: boolean;
  param: TextBlockParam;
  isTranscriptMode?: boolean;
  timestamp?: string;
};

export function UserForkBoilerplateMessage({ param, addMargin, isTranscriptMode, timestamp }: Props): React.ReactNode {
  if (!extractTag(param.text, FORK_BOILERPLATE_TAG)) return null;
  const closeTag = `</${FORK_BOILERPLATE_TAG}>`;
  const afterTag = param.text.slice(param.text.indexOf(closeTag) + closeTag.length).trimStart();
  const userPrompt = afterTag.startsWith(FORK_DIRECTIVE_PREFIX)
    ? afterTag.slice(FORK_DIRECTIVE_PREFIX.length)
    : afterTag;

  return (
    <UserPromptMessage
      addMargin={addMargin}
      param={{ type: 'text', text: userPrompt }}
      isTranscriptMode={isTranscriptMode}
      timestamp={timestamp}
    />
  );
}
