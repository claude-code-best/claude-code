/**
 * Component that registers keybinding handlers for command bindings.
 *
 * Must be rendered inside KeybindingSetup to have access to the keybinding context.
 * Reads "command:*" actions from the current keybinding configuration and registers
 * handlers that invoke the corresponding slash command via onSubmit.
 *
 * Commands triggered via keybinding are treated as "immediate" - they execute right
 * away and preserve the user's existing input text (the prompt is not cleared).
 */
import { useMemo } from 'react';
import { useIsModalOverlayActive } from '../context/overlayContext.js';
import { useOptionalKeybindingContext } from '../keybindings/KeybindingContext.js';
import { useKeybindings } from '../keybindings/useKeybinding.js';
import type { PromptInputHelpers } from '../utils/handlePromptSubmit.js';

type Props = {
  // onSubmit accepts additional parameters beyond what we pass here,
  // so we use a rest parameter to allow any additional args
  onSubmit: (
    input: string,
    helpers: PromptInputHelpers,
    ...rest: [speculationAccept?: undefined, options?: { fromKeybinding?: boolean }]
  ) => void;
  /** Set to false to disable command keybindings (e.g., when a dialog is open) */
  isActive?: boolean;
};

const NOOP_HELPERS: PromptInputHelpers = {
  setCursorOffset: () => {},
  clearBuffer: () => {},
  resetHistory: () => {},
};

/**
 * Registers keybinding handlers for all "command:*" actions found in the
 * user's keybinding configuration. When triggered, each handler submits
 * the corresponding slash command (e.g., "command:commit" submits "/commit").
 */
export function CommandKeybindingHandlers({ onSubmit, isActive = true }: Props): null {
  const keybindingContext = useOptionalKeybindingContext();
  const isModalOverlayActive = useIsModalOverlayActive();

  // Extract command actions from parsed bindings
  const commandActions = useMemo(() => {
    if (!keybindingContext) return new Set<string>();
    const actions = new Set<string>();
    for (const binding of keybindingContext.bindings) {
      if (binding.action?.startsWith('command:')) {
        actions.add(binding.action);
      }
    }
    return actions;
  }, [keybindingContext]);

  // Build handler map for all command actions
  const handlers = useMemo(() => {
    const map: Record<string, () => void> = {};
    for (const action of commandActions) {
      const commandName = action.slice('command:'.length);
      map[action] = () => {
        onSubmit(`/${commandName}`, NOOP_HELPERS, undefined, {
          fromKeybinding: true,
        });
      };
    }
    return map;
  }, [commandActions, onSubmit]);

  useKeybindings(handlers, {
    context: 'Chat',
    isActive: isActive && !isModalOverlayActive,
  });

  return null;
}
