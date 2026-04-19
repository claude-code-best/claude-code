import { useState, useEffect, useMemo } from "react";
import type { ACPClient } from "../acp/client";
import type { AvailableCommand } from "../acp/types";

export interface UseCommandsResult {
  /** List of available slash commands from the agent */
  commands: AvailableCommand[];
  /** Whether any commands are available */
  hasCommands: boolean;
}

/**
 * Hook to manage available commands state.
 * Follows the same pattern as useModels — event-driven with immediate callback.
 */
export function useCommands(client: ACPClient): UseCommandsResult {
  const [commands, setCommands] = useState<AvailableCommand[]>(
    client.availableCommands,
  );

  useEffect(() => {
    const handleCommandsChanged = (newCommands: AvailableCommand[]) => {
      setCommands(newCommands);
    };

    client.setAvailableCommandsChangedHandler(handleCommandsChanged);

    return () => {
      client.setAvailableCommandsChangedHandler(() => {});
    };
  }, [client]);

  const hasCommands = useMemo(
    () => commands.length > 0,
    [commands],
  );

  return { commands, hasCommands };
}
