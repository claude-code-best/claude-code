import type { TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs';
import * as React from 'react';
import { CHANNEL_ARROW } from '../../constants/figures.js';
import { CHANNEL_TAG } from '../../constants/xml.js';
import { Box, Text } from '@anthropic/ink';
import { truncateToWidth } from '../../utils/format.js';

type Props = {
  addMargin: boolean;
  param: TextBlockParam;
};

// <channel source="..." user="..." chat_id="...">content</channel>
// source is always first (wrapChannelMessage writes it), user is optional.
const CHANNEL_RE = new RegExp(`<${CHANNEL_TAG}\\s+source="([^"]+)"([^>]*)>\\n?([\\s\\S]*?)\\n?</${CHANNEL_TAG}>`);
const USER_ATTR_RE = /\buser="([^"]+)"/;

// Plugin-provided servers get names like plugin:slack-channel:slack via
// addPluginScopeToServers — show just the leaf. Matches the suffix-match
// logic in isServerInChannels.
function displayServerName(name: string): string {
  const i = name.lastIndexOf(':');
  return i === -1 ? name : name.slice(i + 1);
}

const MAX_LINE_WIDTH = 80;
const MAX_LINES = 3;

/**
 * Formats multi-line channel content for compact display in the terminal.
 * Collapses excessive blank lines, limits to MAX_LINES, truncates each line.
 */
function formatChannelBody(raw: string): { lines: string[]; truncated: boolean } {
  const body = raw.trim();
  // Split into lines, collapse runs of blank lines into single empty line
  const allLines = body.split(/\n/).reduce<string[]>((acc, line) => {
    const trimmed = line.trimEnd();
    if (trimmed === '' && acc.length > 0 && acc[acc.length - 1] === '') return acc;
    acc.push(trimmed);
    return acc;
  }, []);
  // Remove leading/trailing blank lines
  while (allLines.length > 0 && allLines[0] === '') allLines.shift();
  while (allLines.length > 0 && allLines[allLines.length - 1] === '') allLines.pop();

  const truncated = allLines.length > MAX_LINES;
  const visible = allLines.slice(0, MAX_LINES);
  const lines = visible.map(l => (l === '' ? '' : truncateToWidth(l, MAX_LINE_WIDTH)));
  return { lines, truncated };
}

export function UserChannelMessage({ addMargin, param: { text } }: Props): React.ReactNode {
  const m = CHANNEL_RE.exec(text);
  if (!m) return null;
  const [, source, attrs, content] = m;
  const user = USER_ATTR_RE.exec(attrs ?? '')?.[1];
  const { lines, truncated } = formatChannelBody(content ?? '');

  return (
    <Box marginTop={addMargin ? 1 : 0} flexDirection="column">
      {lines.map((line, i) => (
        <Box key={i}>
          {i === 0 ? (
            <Text>
              <Text color="suggestion">{CHANNEL_ARROW}</Text>{' '}
              <Text dimColor>
                {displayServerName(source ?? '')}
                {user ? ` \u00b7 ${user}` : ''}:
              </Text>{' '}
              {line}
              {truncated && i === lines.length - 1 ? ' …' : ''}
            </Text>
          ) : (
            <Text>
              {'       '}
              {line}
              {truncated && i === lines.length - 1 ? ' …' : ''}
            </Text>
          )}
        </Box>
      ))}
    </Box>
  );
}
