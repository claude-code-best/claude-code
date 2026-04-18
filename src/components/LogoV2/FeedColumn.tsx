import * as React from 'react';
import { Box } from '@anthropic/ink';
import { Divider } from '@anthropic/ink';
import type { FeedConfig } from './Feed.js';
import { calculateFeedWidth, Feed } from './Feed.js';

type FeedColumnProps = {
  feeds: FeedConfig[];
  maxWidth: number;
};

export function FeedColumn({ feeds, maxWidth }: FeedColumnProps): React.ReactNode {
  const feedWidths = feeds.map(feed => calculateFeedWidth(feed));
  const maxOfAllFeeds = Math.max(...feedWidths);
  const actualWidth = Math.min(maxOfAllFeeds, maxWidth);

  return (
    <Box flexDirection="column">
      {feeds.map((feed, index) => (
        <React.Fragment key={index}>
          <Feed config={feed} actualWidth={actualWidth} />
          {index < feeds.length - 1 && <Divider color="claude" width={actualWidth} />}
        </React.Fragment>
      ))}
    </Box>
  );
}
