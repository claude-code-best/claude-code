import React, { useCallback, useState } from 'react';
import { Box, Text } from '@anthropic/ink';
import { getDisplayPath } from '../utils/file.js';
import { removePathFromRepo, validateRepoAtPath } from '../utils/githubRepoPathMapping.js';
import { Select } from './CustomSelect/index.js';
import { Dialog } from '@anthropic/ink';
import { Spinner } from './Spinner.js';

type Props = {
  targetRepo: string;
  initialPaths: string[];
  onSelectPath: (path: string) => void;
  onCancel: () => void;
};

export function TeleportRepoMismatchDialog({
  targetRepo,
  initialPaths,
  onSelectPath,
  onCancel,
}: Props): React.ReactNode {
  const [availablePaths, setAvailablePaths] = useState<string[]>(initialPaths);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);

  const handleChange = useCallback(
    async (value: string): Promise<void> => {
      if (value === 'cancel') {
        onCancel();
        return;
      }

      setValidating(true);
      setErrorMessage(null);

      const isValid = await validateRepoAtPath(value, targetRepo);

      if (isValid) {
        onSelectPath(value);
        return;
      }

      // Path is invalid - remove it from config and update state
      removePathFromRepo(targetRepo, value);
      const updatedPaths = availablePaths.filter(p => p !== value);
      setAvailablePaths(updatedPaths);
      setValidating(false);

      setErrorMessage(`${getDisplayPath(value)} no longer contains the correct repository. Select another path.`);
    },
    [targetRepo, availablePaths, onSelectPath, onCancel],
  );

  const options = [
    ...availablePaths.map(path => ({
      label: (
        <Text>
          Use <Text bold>{getDisplayPath(path)}</Text>
        </Text>
      ),
      value: path,
    })),
    { label: 'Cancel', value: 'cancel' },
  ];

  return (
    <Dialog title="Teleport to Repo" onCancel={onCancel} color="background">
      {availablePaths.length > 0 ? (
        <>
          <Box flexDirection="column" gap={1}>
            {errorMessage && <Text color="error">{errorMessage}</Text>}
            <Text>
              Open Claude Code in <Text bold>{targetRepo}</Text>:
            </Text>
          </Box>

          {validating ? (
            <Box>
              <Spinner />
              <Text> Validating repository…</Text>
            </Box>
          ) : (
            <Select options={options} onChange={value => void handleChange(value)} />
          )}
        </>
      ) : (
        <Box flexDirection="column" gap={1}>
          {errorMessage && <Text color="error">{errorMessage}</Text>}
          <Text dimColor>Run claude --teleport from a checkout of {targetRepo}</Text>
        </Box>
      )}
    </Dialog>
  );
}
