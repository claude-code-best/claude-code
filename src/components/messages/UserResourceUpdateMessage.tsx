import type { TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs';
import * as React from 'react';
import { REFRESH_ARROW } from '../../constants/figures.js';
import { Box, Text } from '@anthropic/ink';

type Props = {
  addMargin: boolean;
  param: TextBlockParam;
};

type ParsedUpdate = {
  kind: 'resource' | 'polling';
  server: string;
  /** URI for resource updates, tool name for polling updates */
  target: string;
  reason?: string;
};

// Parse resource and polling updates from XML format
function parseUpdates(text: string): ParsedUpdate[] {
  const updates: ParsedUpdate[] = [];

  // Match <mcp-resource-update server="..." uri="...">
  const resourceRegex =
    /<mcp-resource-update\s+server="([^"]+)"\s+uri="([^"]+)"[^>]*>(?:[\s\S]*?<reason>([^<]+)<\/reason>)?/g;
  let match;
  while ((match = resourceRegex.exec(text)) !== null) {
    updates.push({
      kind: 'resource',
      server: match[1] ?? '',
      target: match[2] ?? '',
      reason: match[3],
    });
  }

  // Match <mcp-polling-update type="tool" server="..." tool="...">
  const pollingRegex =
    /<mcp-polling-update\s+type="([^"]+)"\s+server="([^"]+)"\s+tool="([^"]+)"[^>]*>(?:[\s\S]*?<reason>([^<]+)<\/reason>)?/g;
  while ((match = pollingRegex.exec(text)) !== null) {
    updates.push({
      kind: 'polling',
      server: match[2] ?? '',
      target: match[3] ?? '',
      reason: match[4],
    });
  }

  return updates;
}

// Format URI for display - show just the meaningful part
function formatUri(uri: string): string {
  // For file:// URIs, show just the filename
  if (uri.startsWith('file://')) {
    const path = uri.slice(7);
    const parts = path.split('/');
    return parts[parts.length - 1] || path;
  }
  // For other URIs, show the whole thing but truncated
  if (uri.length > 40) {
    return uri.slice(0, 39) + '\u2026';
  }
  return uri;
}

export function UserResourceUpdateMessage({ addMargin, param: { text } }: Props): React.ReactNode {
  const updates = parseUpdates(text);
  if (updates.length === 0) return null;

  return (
    <Box flexDirection="column" marginTop={addMargin ? 1 : 0}>
      {updates.map((update, i) => (
        <Box key={i}>
          <Text>
            <Text color="success">{REFRESH_ARROW}</Text> <Text dimColor>{update.server}:</Text>{' '}
            <Text color="suggestion">{update.kind === 'resource' ? formatUri(update.target) : update.target}</Text>
            {update.reason && <Text dimColor> · {update.reason}</Text>}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
