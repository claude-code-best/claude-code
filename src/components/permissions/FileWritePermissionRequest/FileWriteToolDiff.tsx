import * as React from 'react';
import { useMemo } from 'react';
import { useTerminalSize } from '../../../hooks/useTerminalSize.js';
import { Box, NoSelect, Text } from '@anthropic/ink';
import { intersperse } from '../../../utils/array.js';
import { getPatchForDisplay } from '../../../utils/diff.js';
import { HighlightedCode } from '../../HighlightedCode.js';
import { StructuredDiff } from '../../StructuredDiff.js';

type Props = {
  file_path: string;
  content: string;
  fileExists: boolean;
  oldContent: string;
};

export function FileWriteToolDiff({ file_path, content, fileExists, oldContent }: Props): React.ReactNode {
  const { columns } = useTerminalSize();
  const hunks = useMemo(() => {
    if (!fileExists) {
      return null;
    }
    return getPatchForDisplay({
      filePath: file_path,
      fileContents: oldContent,
      edits: [
        {
          old_string: oldContent,
          new_string: content,
          replace_all: false,
        },
      ],
    });
  }, [fileExists, file_path, oldContent, content]);

  const firstLine = content.split('\n')[0] ?? null;
  const paddingX = 1;

  return (
    <Box flexDirection="column">
      <Box
        borderColor="subtle"
        borderStyle="dashed"
        flexDirection="column"
        borderLeft={false}
        borderRight={false}
        paddingX={paddingX}
      >
        {hunks ? (
          intersperse(
            hunks.map(_ => (
              <StructuredDiff
                key={_.newStart}
                patch={_}
                dim={false}
                filePath={file_path}
                firstLine={firstLine}
                fileContent={oldContent}
                width={columns - 2 * paddingX}
              />
            )),
            i => (
              <NoSelect fromLeftEdge key={`ellipsis-${i}`}>
                <Text dimColor>...</Text>
              </NoSelect>
            ),
          )
        ) : (
          <HighlightedCode code={content || '(No content)'} filePath={file_path} />
        )}
      </Box>
    </Box>
  );
}
