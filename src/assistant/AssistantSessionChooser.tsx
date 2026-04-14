import * as React from 'react';
import { useState } from 'react';
import { Box, Text } from '@anthropic/ink';
import { Dialog } from '../components/design-system/Dialog.js';
import { ListItem } from '../components/design-system/ListItem.js';
import { useRegisterOverlay } from '../context/overlayContext.js';
import { useKeybindings } from '../keybindings/useKeybinding.js';
import type { AssistantSession } from './sessionDiscovery.js';

interface Props {
  sessions: AssistantSession[];
  onSelect: (id: string) => void;
  onCancel: () => void;
}

/**
 * Interactive session chooser for `claude assistant` when multiple
 * CCR sessions are discovered. Renders a Dialog with up/down navigation.
 *
 * Session IDs are in `session_*` compat format — passed directly to
 * createRemoteSessionConfig() for viewer attach.
 */
export function AssistantSessionChooser({ sessions, onSelect, onCancel }: Props): React.ReactNode {
  useRegisterOverlay('assistant-session-chooser');
  const [focusIndex, setFocusIndex] = useState(0);

  useKeybindings(
    {
      'select:next': () => setFocusIndex(i => (i + 1) % sessions.length),
      'select:previous': () => setFocusIndex(i => (i - 1 + sessions.length) % sessions.length),
      'select:accept': () => onSelect(sessions[focusIndex]!.id),
    },
    { context: 'Select' },
  );

  return (
    <Dialog title="Select Assistant Session" onCancel={onCancel} hideInputGuide>
      <Box flexDirection="column" gap={1}>
        <Text>Multiple sessions found. Select one to attach:</Text>
        <Box flexDirection="column">
          {sessions.map((s, i) => (
            <ListItem key={s.id} isFocused={focusIndex === i}>
              <Box>
                <Text>{s.title || s.id.slice(0, 20)}</Text>
                <Text dimColor> [{s.status}]</Text>
              </Box>
            </ListItem>
          ))}
        </Box>
        <Text dimColor>↑↓ navigate · Enter select · Esc cancel</Text>
      </Box>
    </Dialog>
  );
}
