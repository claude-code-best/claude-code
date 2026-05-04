import * as React from 'react';
import { Box, Text, stringWidth } from '@anthropic/ink';
import { truncate } from '../../utils/format.js';

export type FeedLine = {
  text: string;
  timestamp?: string;
};

export type FeedConfig = {
  title: string;
  lines: FeedLine[];
  footer?: string;
  emptyMessage?: string;
  customContent?: { content: React.ReactNode; width: number };
};

type FeedProps = {
  config: FeedConfig;
  actualWidth: number;
};

export function calculateFeedWidth(config: FeedConfig): number {
  const { title, lines, footer, emptyMessage, customContent } = config;

  let maxWidth = stringWidth(title);

  if (customContent !== undefined) {
    maxWidth = Math.max(maxWidth, customContent.width);
  } else if (lines.length === 0 && emptyMessage) {
    maxWidth = Math.max(maxWidth, stringWidth(emptyMessage));
  } else {
    const gap = '  ';
    const maxTimestampWidth = Math.max(0, ...lines.map(line => (line.timestamp ? stringWidth(line.timestamp) : 0)));

    for (const line of lines) {
      const timestampWidth = maxTimestampWidth > 0 ? maxTimestampWidth : 0;
      const lineWidth = stringWidth(line.text) + (timestampWidth > 0 ? timestampWidth + gap.length : 0);
      maxWidth = Math.max(maxWidth, lineWidth);
    }
  }

  if (footer) {
    maxWidth = Math.max(maxWidth, stringWidth(footer));
  }

  return maxWidth;
}

export function Feed({ config, actualWidth }: FeedProps): React.ReactNode {
  const { title, lines, footer, emptyMessage, customContent } = config;

  const gap = '  ';
  const maxTimestampWidth = Math.max(0, ...lines.map(line => (line.timestamp ? stringWidth(line.timestamp) : 0)));

  return (
    <Box flexDirection="column" width={actualWidth}>
      <Text bold color="claude">
        {title}
      </Text>
      {customContent ? (
        <>
          {customContent.content}
          {footer && (
            <Text dimColor italic>
              {truncate(footer, actualWidth)}
            </Text>
          )}
        </>
      ) : lines.length === 0 && emptyMessage ? (
        <Text dimColor>{truncate(emptyMessage, actualWidth)}</Text>
      ) : (
        <>
          {lines.map((line, index) => {
            const textWidth = Math.max(10, actualWidth - (maxTimestampWidth > 0 ? maxTimestampWidth + gap.length : 0));

            return (
              <Text key={index}>
                {maxTimestampWidth > 0 && (
                  <>
                    <Text dimColor>{(line.timestamp || '').padEnd(maxTimestampWidth)}</Text>
                    {gap}
                  </>
                )}
                <Text>{truncate(line.text, textWidth)}</Text>
              </Text>
            );
          })}
          {footer && (
            <Text dimColor italic>
              {truncate(footer, actualWidth)}
            </Text>
          )}
        </>
      )}
    </Box>
  );
}
