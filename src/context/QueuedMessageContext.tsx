import * as React from 'react';
import { Box } from '@anthropic/ink';

type QueuedMessageContextValue = {
  isQueued: boolean;
  isFirst: boolean;
  /** Width reduction for container padding (e.g., 4 for paddingX={2}) */
  paddingWidth: number;
};

const QueuedMessageContext = React.createContext<QueuedMessageContextValue | undefined>(undefined);

export function useQueuedMessage(): QueuedMessageContextValue | undefined {
  return React.useContext(QueuedMessageContext);
}

const PADDING_X = 2;

type Props = {
  isFirst: boolean;
  useBriefLayout?: boolean;
  children: React.ReactNode;
};

export function QueuedMessageProvider({ isFirst, useBriefLayout, children }: Props): React.ReactNode {
  // Brief mode already indents via paddingLeft in HighlightedThinkingText /
  // BriefTool UI — adding paddingX here would double-indent the queue.
  const padding = useBriefLayout ? 0 : PADDING_X;
  const value = React.useMemo(() => ({ isQueued: true, isFirst, paddingWidth: padding * 2 }), [isFirst, padding]);

  return (
    <QueuedMessageContext.Provider value={value}>
      <Box paddingX={padding}>{children}</Box>
    </QueuedMessageContext.Provider>
  );
}
