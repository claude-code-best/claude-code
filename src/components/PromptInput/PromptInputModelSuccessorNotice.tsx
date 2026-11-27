import figures from 'figures';
import * as React from 'react';
import { Box, Text } from '@anthropic/ink';
import { useShortcutDisplay } from '../../keybindings/useShortcutDisplay.js';
import { getMarketingNameForModel } from '../../utils/model/model.js';
import { buildSavedModelSuccessorMessage, type SavedModelSuccessor } from '../../utils/model/successor.js';

type Props = {
  /** The active saved-model successor (notice is only rendered when non-null). */
  successor: SavedModelSuccessor;
};

/**
 * Saved-model successor notice (official 2.1.330 `chat:defaultToNewerModel`,
 * binary L936681 — the independent `ld()` component mounted above the prompt
 * input). Two segments, official verbatim:
 *
 *   "{from} is your default model. Press `{key}` to make `{to}` your default."
 *
 * - `{from}` renders the saved model's marketing name (e.g. "Opus 4.6").
 * - `{key}` resolves through the keybinding system
 *   (useShortcutDisplay('chat:defaultToNewerModel', 'Chat', 'ctrl+y')).
 * - `{to}` renders with backticks (official renders the model ID in `code`
 *   form).
 *
 * Pressing the key (PromptInput's chat:defaultToNewerModel handler) switches
 * the default model to `to` and consumes the notice. Rendered in the same
 * slot as PromptInputStashNotice (the notice row above the input box), and —
 * like the official component — only while the input box is empty and the
 * main loop is idle (the display gate lives in PromptInput, see
 * shouldShowSavedModelSuccessor).
 */
export function PromptInputModelSuccessorNotice({ successor }: Props): React.ReactNode {
  const key = useShortcutDisplay('chat:defaultToNewerModel', 'Chat', 'ctrl+y');
  const message = buildSavedModelSuccessorMessage({
    fromDisplayName: getMarketingNameForModel(successor.from) ?? successor.from,
    to: successor.to,
    key,
  });

  return (
    <Box paddingLeft={2}>
      <Text dimColor>
        {figures.pointerSmall} {message.first} {message.second}
      </Text>
    </Box>
  );
}
