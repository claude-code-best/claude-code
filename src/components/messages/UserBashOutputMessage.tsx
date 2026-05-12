import * as React from 'react';
import BashToolResultMessage from '@claude-code-best/builtin-tools/tools/BashTool/BashToolResultMessage.js';
import { extractTag } from '../../utils/messages.js';

export function UserBashOutputMessage({ content, verbose }: { content: string; verbose?: boolean }): React.ReactNode {
  const rawStdout = extractTag(content, 'bash-stdout') ?? '';
  // Unwrap <persisted-output> if present — keep the inner content (file path +
  // preview) for the user; the wrapper tag itself is model-facing signaling.
  const stdout = extractTag(rawStdout, 'persisted-output') ?? rawStdout;
  const stderr = extractTag(content, 'bash-stderr') ?? '';
  return <BashToolResultMessage content={{ stdout, stderr }} verbose={!!verbose} />;
}
