import * as React from 'react';
import { Box, Text, setClipboard, useInput } from '@anthropic/ink';
import type { ArtifactInfo } from './scanner.js';
import { openBrowser } from 'src/utils/browser.js';

type Props = {
  artifacts: ArtifactInfo[];
  onExit: () => void;
};

export function ArtifactsMenu({ artifacts, onExit }: Props): React.ReactElement {
  const [selected, setSelected] = React.useState(0);

  useInput((input, key) => {
    if (input === 'q' || key.escape) {
      onExit();
      return;
    }
    if (artifacts.length === 0) return;
    if (key.upArrow) {
      setSelected(s => (s - 1 + artifacts.length) % artifacts.length);
      return;
    }
    if (key.downArrow) {
      setSelected(s => (s + 1) % artifacts.length);
      return;
    }
    if (key.return) {
      const target = artifacts[selected];
      if (target.url) {
        void openBrowser(target.url);
      }
      return;
    }
    if (input === 'c') {
      const target = artifacts[selected];
      if (target.url) {
        void setClipboard(target.url).then(raw => {
          if (raw) process.stdout.write(raw);
        });
      }
    }
  });

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0}>
      <Box marginBottom={1}>
        <Text bold>Artifacts ({artifacts.length})</Text>
      </Box>

      {artifacts.length === 0 ? (
        <Text color="subtle">No artifacts uploaded this session. Run /use-artifacts to learn how.</Text>
      ) : (
        <Box flexDirection="column">
          {artifacts.map((a, idx) => (
            <ArtifactRow key={a.toolUseId} artifact={a} isSelected={idx === selected} />
          ))}
          <Box marginTop={1}>
            <Text color="subtle">{'↑/↓ select · Enter open · c copy URL · Esc exit'}</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}

function ArtifactRow({ artifact, isSelected }: { artifact: ArtifactInfo; isSelected: boolean }): React.ReactElement {
  const marker = isSelected ? '›' : ' ';
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={isSelected ? 'suggestion' : undefined}>{marker} </Text>
        <Text bold={isSelected} color={artifact.isError ? 'error' : undefined}>
          {artifact.basename}
        </Text>
        {artifact.hash ? <Text color="subtle"> ({artifact.hash})</Text> : null}
      </Box>
      {artifact.url ? (
        <Box marginLeft={2}>
          <Text color="background">{artifact.url}</Text>
        </Box>
      ) : (
        <Box marginLeft={2}>
          <Text color="error">{artifact.rawContent}</Text>
        </Box>
      )}
      {artifact.expiresAt ? (
        <Box marginLeft={2}>
          <Text color="subtle">expires: {artifact.expiresAt}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
