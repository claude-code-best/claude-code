import React, { createContext, type ReactNode, useContext } from 'react';
import { Box, Text } from '@anthropic/ink';

export const OrderedListItemContext = createContext({ marker: '' });

type OrderedListItemProps = {
  children: ReactNode;
};

export function OrderedListItem({ children }: OrderedListItemProps): React.ReactNode {
  const { marker } = useContext(OrderedListItemContext);

  return (
    <Box gap={1}>
      <Text dimColor>{marker}</Text>
      <Box flexDirection="column">{children}</Box>
    </Box>
  );
}
