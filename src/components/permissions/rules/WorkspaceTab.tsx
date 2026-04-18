import figures from 'figures';
import * as React from 'react';
import { useCallback, useEffect } from 'react';
import { getOriginalCwd } from '../../../bootstrap/state.js';
import type { CommandResultDisplay } from '../../../commands.js';
import { Select } from '../../../components/CustomSelect/select.js';
import { Box, Text, useTabHeaderFocus } from '@anthropic/ink';
import type { ToolPermissionContext } from '../../../Tool.js';

type Props = {
  onExit: (result?: string, options?: { display?: CommandResultDisplay }) => void;
  toolPermissionContext: ToolPermissionContext;
  onRequestAddDirectory: () => void;
  onRequestRemoveDirectory: (path: string) => void;
  onHeaderFocusChange?: (focused: boolean) => void;
};

type DirectoryItem = {
  path: string;
  isCurrent: boolean;
  isDeletable: boolean;
};

export function WorkspaceTab({
  onExit,
  toolPermissionContext,
  onRequestAddDirectory,
  onRequestRemoveDirectory,
  onHeaderFocusChange,
}: Props): React.ReactNode {
  const { headerFocused, focusHeader } = useTabHeaderFocus();
  useEffect(() => {
    onHeaderFocusChange?.(headerFocused);
  }, [headerFocused, onHeaderFocusChange]);
  // Get only additional workspace directories (not the current working directory)
  const additionalDirectories = React.useMemo((): DirectoryItem[] => {
    return Array.from(toolPermissionContext.additionalWorkingDirectories.keys()).map(path => ({
      path,
      isCurrent: false,
      isDeletable: true,
    }));
  }, [toolPermissionContext.additionalWorkingDirectories]);

  const handleDirectorySelect = useCallback(
    (selectedValue: string) => {
      if (selectedValue === 'add-directory') {
        onRequestAddDirectory();
        return;
      }

      const directory = additionalDirectories.find(d => d.path === selectedValue);
      if (directory && directory.isDeletable) {
        onRequestRemoveDirectory(directory.path);
      }
    },
    [additionalDirectories, onRequestAddDirectory, onRequestRemoveDirectory],
  );

  const handleCancel = useCallback(() => onExit('Workspace dialog dismissed', { display: 'system' }), [onExit]);

  // Main list view options
  const options = React.useMemo(() => {
    const opts = additionalDirectories.map(dir => ({
      label: dir.path,
      value: dir.path,
    }));

    opts.push({
      label: `Add directory${figures.ellipsis}`,
      value: 'add-directory',
    });

    return opts;
  }, [additionalDirectories]);

  // Main list view
  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Current working directory section */}
      <Box flexDirection="row" marginTop={1} marginLeft={2} gap={1}>
        <Text>{`-  ${getOriginalCwd()}`}</Text>
        <Text dimColor>(Original working directory)</Text>
      </Box>
      <Select
        options={options}
        onChange={handleDirectorySelect}
        onCancel={handleCancel}
        visibleOptionCount={Math.min(10, options.length)}
        onUpFromFirstItem={focusHeader}
        isDisabled={headerFocused}
      />
    </Box>
  );
}
