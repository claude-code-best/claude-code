import type { StructuredPatchHunk } from 'diff';
import { relative } from 'path';
import * as React from 'react';
import { useTerminalSize } from 'src/hooks/useTerminalSize.js';
import { getCwd } from 'src/utils/cwd.js';
import { Box, Text } from '@anthropic/ink';
import { HighlightedCode } from './HighlightedCode.js';
import { MessageResponse } from './MessageResponse.js';
import { StructuredDiffList } from './StructuredDiffList.js';

const MAX_LINES_TO_RENDER = 10;

type Props = {
  file_path: string;
  operation: 'write' | 'update';
  // For updates - show diff
  patch?: StructuredPatchHunk[];
  firstLine: string | null;
  fileContent?: string;
  // For new file creation - show content preview
  content?: string;
  style?: 'condensed';
  verbose: boolean;
};

export function FileEditToolUseRejectedMessage({
  file_path,
  operation,
  patch,
  firstLine,
  fileContent,
  content,
  style,
  verbose,
}: Props): React.ReactNode {
  const { columns } = useTerminalSize();
  const text = (
    <Box flexDirection="row">
      <Text color="subtle">User rejected {operation} to </Text>
      <Text bold color="subtle">
        {verbose ? file_path : relative(getCwd(), file_path)}
      </Text>
    </Box>
  );

  // For condensed style, just show the text
  if (style === 'condensed' && !verbose) {
    return <MessageResponse>{text}</MessageResponse>;
  }

  // For new file creation, show content preview (dimmed)
  if (operation === 'write' && content !== undefined) {
    const lines = content.split('\n');
    const numLines = lines.length;
    const plusLines = numLines - MAX_LINES_TO_RENDER;
    const truncatedContent = verbose ? content : lines.slice(0, MAX_LINES_TO_RENDER).join('\n');

    return (
      <MessageResponse>
        <Box flexDirection="column">
          {text}
          <HighlightedCode code={truncatedContent || '(No content)'} filePath={file_path} width={columns - 12} dim />
          {!verbose && plusLines > 0 && <Text dimColor>… +{plusLines} lines</Text>}
        </Box>
      </MessageResponse>
    );
  }

  // For updates, show diff
  if (!patch || patch.length === 0) {
    return <MessageResponse>{text}</MessageResponse>;
  }

  return (
    <MessageResponse>
      <Box flexDirection="column">
        {text}
        <StructuredDiffList
          hunks={patch}
          dim
          width={columns - 12}
          filePath={file_path}
          firstLine={firstLine}
          fileContent={fileContent}
        />
      </Box>
    </MessageResponse>
  );
}
