import React, { createContext, isValidElement, type ReactNode, useContext } from 'react';
import { Box } from '@anthropic/ink';
import { OrderedListItem, OrderedListItemContext } from './OrderedListItem.js';

const OrderedListContext = createContext({ marker: '' });

type OrderedListProps = {
  children: ReactNode;
};

function OrderedListComponent({ children }: OrderedListProps): React.ReactNode {
  const { marker: parentMarker } = useContext(OrderedListContext);

  let numberOfItems = 0;
  for (const child of React.Children.toArray(children)) {
    if (!isValidElement(child) || child.type !== OrderedListItem) {
      continue;
    }
    numberOfItems++;
  }

  const maxMarkerWidth = String(numberOfItems).length;

  return (
    <Box flexDirection="column">
      {React.Children.map(children, (child, index) => {
        if (!isValidElement(child) || child.type !== OrderedListItem) {
          return child;
        }

        const paddedMarker = `${String(index + 1).padStart(maxMarkerWidth)}.`;
        const marker = `${parentMarker}${paddedMarker}`;

        return (
          <OrderedListContext.Provider value={{ marker }}>
            <OrderedListItemContext.Provider value={{ marker }}>{child}</OrderedListItemContext.Provider>
          </OrderedListContext.Provider>
        );
      })}
    </Box>
  );
}

// eslint-disable-next-line custom-rules/no-top-level-side-effects
OrderedListComponent.Item = OrderedListItem;

export const OrderedList = OrderedListComponent;
