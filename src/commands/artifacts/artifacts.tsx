import * as React from 'react';
import type { LocalJSXCommandOnDone } from 'src/types/command.js';
import type { ToolUseContext } from 'src/Tool.js';
import { ArtifactsMenu } from './ArtifactsMenu.js';
import { extractArtifacts } from './scanner.js';

export async function call(onDone: LocalJSXCommandOnDone, context: ToolUseContext): Promise<React.ReactNode> {
  const messages = context.messages ?? [];
  const artifacts = extractArtifacts(messages);
  return <ArtifactsMenu artifacts={artifacts} onExit={onDone} />;
}
