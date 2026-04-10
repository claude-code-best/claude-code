import type { ToolUseBlockParam } from '@anthropic-ai/sdk/resources/index.mjs';
import { useMemo } from 'react';
import { findToolByName, type Tool, type Tools } from '../../../Tool.js';
import type { buildMessageLookups } from '../../../utils/messages.js';

export function useGetToolFromMessages(
  toolUseID: string,
  tools: Tools,
  lookups: ReturnType<typeof buildMessageLookups>,
): { tool: Tool; toolUse: ToolUseBlockParam } | null {
  return useMemo(() => {
    const toolUse = lookups.toolUseByToolUseID.get(toolUseID);
    if (!toolUse) {
      return null;
    }
    const tool = findToolByName(tools, toolUse.name);
    if (!tool) {
      return null;
    }
    return { tool, toolUse };
  }, [toolUseID, lookups, tools]);
}
