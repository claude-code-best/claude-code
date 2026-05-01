import React from 'react';
import { useIsInsideModal } from './modalContext.js';
import { Box } from '../index.js';
import type { Theme } from './theme-types.js';
import { Divider } from './Divider.js';

type PaneProps = {
  children: React.ReactNode;
  /**
   * Theme color for the top border line.
   */
  color?: keyof Theme;
};

/**
 * A pane — a region of the terminal that appears below the REPL prompt,
 * bounded by a colored top line with a one-row gap above and horizontal
 * padding. Used by all slash-command screens: /config, /help, /plugins,
 * /sandbox, /stats, /permissions.
 *
 * For confirm/cancel dialogs (Esc to dismiss, Enter to confirm), use
 * `<Dialog>` instead — it registers its own keybindings. For a full
 * rounded-border card, use `<Panel>`.
 *
 * Submenus rendered inside a Pane should use `hideBorder` on their Dialog
 * so the Pane's border remains the single frame.
 *
 * @example
 * <Pane color="permission">
 *   <Tabs title="Sandbox:">...</Tabs>
 * </Pane>
 */
export function Pane({ children, color }: PaneProps): React.ReactNode {
  // When rendered inside FullscreenLayout's modal slot, its ▔ divider IS
  // the frame. Skip our own Divider (would double-frame) and the extra top
  // padding. This lets slash-command screens that wrap in Pane (e.g.
  // /model → ModelPicker) route through the modal slot unchanged.
  if (useIsInsideModal()) {
    // flexShrink=0: the modal slot's absolute Box has no explicit height
    // (grows to fit, maxHeight cap). With flexGrow=1, re-renders cause
    // yoga to resolve this Box's height to 0 against the undetermined
    // parent — /permissions body blanks on Down arrow. See #23592.
    return (
      <Box flexDirection="column" paddingX={1} flexShrink={0}>
        {children}
      </Box>
    );
  }
  return (
    <Box flexDirection="column" paddingTop={1}>
      <Divider color={color} />
      <Box flexDirection="column" paddingX={2}>
        {children}
      </Box>
    </Box>
  );
}
