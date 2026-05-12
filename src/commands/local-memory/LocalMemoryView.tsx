import React from 'react';
import { Box, Text } from '@anthropic/ink';
import type { Theme } from '@anthropic/ink';

export type LocalMemoryViewProps =
  | { mode: 'list'; stores: string[] }
  | { mode: 'created'; store: string }
  | { mode: 'stored'; store: string; key: string }
  | { mode: 'fetched'; store: string; key: string; value: string }
  | { mode: 'not-found'; store: string; key?: string }
  | { mode: 'entries'; store: string; keys: string[] }
  | { mode: 'archived'; store: string }
  | { mode: 'error'; message: string };

export function LocalMemoryView(props: LocalMemoryViewProps): React.ReactNode {
  if (props.mode === 'list') {
    if (props.stores.length === 0) {
      return (
        <Box>
          <Text dimColor>No memory stores found. Use /local-memory create &lt;store&gt; to create one.</Text>
        </Box>
      );
    }
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>Local Memory Stores ({props.stores.length})</Text>
        </Box>
        {props.stores.map(s => (
          <Box key={s}>
            <Text> </Text>
            <Text color={'success' as keyof Theme}>◆</Text>
            <Text> {s}</Text>
          </Box>
        ))}
      </Box>
    );
  }

  if (props.mode === 'created') {
    return (
      <Box>
        <Text color={'success' as keyof Theme}>✓</Text>
        <Text> Store created: </Text>
        <Text bold>{props.store}</Text>
      </Box>
    );
  }

  if (props.mode === 'stored') {
    return (
      <Box>
        <Text color={'success' as keyof Theme}>✓</Text>
        <Text> Stored entry </Text>
        <Text bold>{props.key}</Text>
        <Text> in </Text>
        <Text bold>{props.store}</Text>
      </Box>
    );
  }

  if (props.mode === 'fetched') {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>{props.store}</Text>
          <Text dimColor>/</Text>
          <Text bold>{props.key}</Text>
        </Box>
        <Box>
          <Text>{props.value}</Text>
        </Box>
      </Box>
    );
  }

  if (props.mode === 'not-found') {
    return (
      <Box>
        <Text color={'error' as keyof Theme}>Not found: </Text>
        <Text bold>{props.store}</Text>
        {props.key ? (
          <>
            <Text dimColor>/</Text>
            <Text bold>{props.key}</Text>
          </>
        ) : null}
      </Box>
    );
  }

  if (props.mode === 'entries') {
    if (props.keys.length === 0) {
      return (
        <Box>
          <Text dimColor>No entries in </Text>
          <Text bold>{props.store}</Text>
          <Text dimColor>. Use /local-memory store {props.store} &lt;key&gt; &lt;value&gt; to add one.</Text>
        </Box>
      );
    }
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>{props.store}</Text>
          <Text dimColor> ({props.keys.length} entries)</Text>
        </Box>
        {props.keys.map(k => (
          <Box key={k}>
            <Text> </Text>
            <Text color={'success' as keyof Theme}>·</Text>
            <Text> {k}</Text>
          </Box>
        ))}
      </Box>
    );
  }

  if (props.mode === 'archived') {
    return (
      <Box>
        <Text color={'success' as keyof Theme}>✓</Text>
        <Text> Archived store: </Text>
        <Text bold>{props.store}</Text>
        <Text dimColor> (renamed to {props.store}.archived)</Text>
      </Box>
    );
  }

  // mode === 'error'
  return (
    <Box>
      <Text color={'error' as keyof Theme}>Error: {props.message}</Text>
    </Box>
  );
}
