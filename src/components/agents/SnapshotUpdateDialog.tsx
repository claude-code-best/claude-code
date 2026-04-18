import React from 'react';
import { Dialog, Text } from '@anthropic/ink';
import type { AgentMemoryScope } from '@claude-code-best/builtin-tools/tools/AgentTool/agentMemory.js';
import { Select } from '../CustomSelect/index.js';

interface SnapshotUpdateDialogProps {
  agentType: string;
  scope: AgentMemoryScope;
  snapshotTimestamp: string;
  onComplete: (choice: 'merge' | 'keep' | 'replace') => void;
  onCancel: () => void;
}

export function SnapshotUpdateDialog({
  agentType,
  scope,
  snapshotTimestamp,
  onComplete,
  onCancel,
}: SnapshotUpdateDialogProps): React.ReactElement {
  return (
    <Dialog
      title="Agent memory snapshot update"
      subtitle={`A newer ${scope} memory snapshot is available for ${agentType}.`}
      onCancel={onCancel}
      color={'warning' as const}
    >
      <Text dimColor key="timestamp">
        Snapshot timestamp: {snapshotTimestamp}
      </Text>
      <Select<'merge' | 'keep' | 'replace'>
        key="select"
        defaultFocusValue="merge"
        options={[
          {
            label: 'Merge snapshot into current memory',
            value: 'merge',
            description: 'Keep current memory and ask Claude to merge in the snapshot changes.',
          },
          {
            label: 'Keep current memory',
            value: 'keep',
            description: 'Ignore this snapshot update and continue with current memory.',
          },
          {
            label: 'Replace with snapshot',
            value: 'replace',
            description: 'Overwrite current memory files with the snapshot contents.',
          },
        ]}
        onChange={onComplete}
      />
    </Dialog>
  );
}

export function buildMergePrompt(agentType: string, scope: AgentMemoryScope): string {
  return `A newer ${scope} persistent memory snapshot is available for the "${agentType}" agent.

Please merge the snapshot update into the current ${scope} agent memory before continuing:
- Preserve useful current memory entries.
- Incorporate newer or more accurate information from the snapshot.
- Resolve duplicates or conflicts in favor of the most current, specific information.
- Keep the memory concise and relevant to future runs of this agent.

After merging, continue with the user's request.`;
}
