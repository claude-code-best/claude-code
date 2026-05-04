import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs';
import * as React from 'react';
import { KeyboardShortcutHint } from '@anthropic/ink';
import { FallbackToolUseErrorMessage } from 'src/components/FallbackToolUseErrorMessage.js';
import { MessageResponse } from 'src/components/MessageResponse.js';
import { ShellProgressMessage } from 'src/components/shell/ShellProgressMessage.js';
import { Box, Text } from '@anthropic/ink';
import { useKeybinding } from 'src/keybindings/useKeybinding.js';
import { useShortcutDisplay } from 'src/keybindings/useShortcutDisplay.js';
import { useAppStateStore, useSetAppState } from 'src/state/AppState.js';
import type { Tool } from 'src/Tool.js';
import { backgroundAll } from 'src/tasks/LocalShellTask/LocalShellTask.js';
import type { ProgressMessage } from 'src/types/message.js';
import { env } from 'src/utils/env.js';
import { isEnvTruthy } from 'src/utils/envUtils.js';
import { getDisplayPath } from 'src/utils/file.js';
import { isFullscreenEnvEnabled } from 'src/utils/fullscreen.js';
import type { ThemeName } from 'src/utils/theme.js';
import type { BashProgress, BashToolInput, Out } from './BashTool.js';
import BashToolResultMessage from './BashToolResultMessage.js';
import { extractBashCommentLabel } from './commentLabel.js';
import { parseSedEditCommand } from './sedEditParser.js';

// Constants for command display
const MAX_COMMAND_DISPLAY_LINES = 2;
const MAX_COMMAND_DISPLAY_CHARS = 160;

// Simple component to show background hint and handle ctrl+b
// When ctrl+b is pressed, backgrounds ALL running foreground commands
export function BackgroundHint({ onBackground }: { onBackground?: () => void } = {}): React.ReactElement | null {
  const store = useAppStateStore();
  const setAppState = useSetAppState();

  // Handler for task:background - background all foreground tasks
  const handleBackground = React.useCallback(() => {
    // Background ALL foreground bash tasks
    backgroundAll(() => store.getState(), setAppState);
    // Also call the optional callback (used for non-bash tasks like agents)
    onBackground?.();
  }, [store, setAppState, onBackground]);

  useKeybinding('task:background', handleBackground, {
    context: 'Task',
  });

  // Get the configured shortcut for task:background
  const baseShortcut = useShortcutDisplay('task:background', 'Task', 'ctrl+b');
  // In tmux, ctrl+b is the prefix key, so users need to press it twice to send ctrl+b
  const shortcut = env.terminal === 'tmux' && baseShortcut === 'ctrl+b' ? 'ctrl+b ctrl+b (twice)' : baseShortcut;

  // Don't show background hint if background tasks are disabled
  if (isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS)) {
    return null;
  }

  return (
    <Box paddingLeft={5}>
      <Text dimColor>
        <KeyboardShortcutHint shortcut={shortcut} action="run in background" parens />
      </Text>
    </Box>
  );
}

export function renderToolUseMessage(
  input: Partial<BashToolInput>,
  { verbose, theme: _theme }: { verbose: boolean; theme: ThemeName },
): React.ReactNode {
  const { command } = input;
  if (!command) {
    return null;
  }

  // Render sed in-place edits like file edits (show file path only)
  const sedInfo = parseSedEditCommand(command);
  if (sedInfo) {
    return verbose ? sedInfo.filePath : getDisplayPath(sedInfo.filePath);
  }

  if (!verbose) {
    const lines = command.split('\n');

    if (isFullscreenEnvEnabled()) {
      const label = extractBashCommentLabel(command);
      if (label) {
        return label.length > MAX_COMMAND_DISPLAY_CHARS ? label.slice(0, MAX_COMMAND_DISPLAY_CHARS) + '…' : label;
      }
    }

    const needsLineTruncation = lines.length > MAX_COMMAND_DISPLAY_LINES;
    const needsCharTruncation = command.length > MAX_COMMAND_DISPLAY_CHARS;

    if (needsLineTruncation || needsCharTruncation) {
      let truncated = command;

      // First truncate by lines if needed
      if (needsLineTruncation) {
        truncated = lines.slice(0, MAX_COMMAND_DISPLAY_LINES).join('\n');
      }

      // Then truncate by chars if still too long
      if (truncated.length > MAX_COMMAND_DISPLAY_CHARS) {
        truncated = truncated.slice(0, MAX_COMMAND_DISPLAY_CHARS);
      }

      return <Text>{truncated.trim()}…</Text>;
    }
  }

  return command;
}

export function renderToolUseProgressMessage(
  progressMessagesForMessage: ProgressMessage<BashProgress>[],
  {
    verbose,
    tools: _tools,
    terminalSize: _terminalSize,
    inProgressToolCallCount: _inProgressToolCallCount,
  }: {
    tools: Tool[];
    verbose: boolean;
    terminalSize?: { columns: number; rows: number };
    inProgressToolCallCount?: number;
  },
): React.ReactNode {
  const lastProgress = progressMessagesForMessage.at(-1);

  if (!lastProgress || !lastProgress.data) {
    return (
      <MessageResponse height={1}>
        <Text dimColor>Running…</Text>
      </MessageResponse>
    );
  }

  const data = lastProgress.data;

  return (
    <ShellProgressMessage
      fullOutput={data.fullOutput}
      output={data.output}
      elapsedTimeSeconds={data.elapsedTimeSeconds}
      totalLines={data.totalLines}
      totalBytes={data.totalBytes}
      timeoutMs={data.timeoutMs}
      taskId={data.taskId}
      verbose={verbose}
    />
  );
}

export function renderToolUseQueuedMessage(): React.ReactNode {
  return (
    <MessageResponse height={1}>
      <Text dimColor>Waiting…</Text>
    </MessageResponse>
  );
}

export function renderToolResultMessage(
  content: Out,
  progressMessagesForMessage: ProgressMessage<BashProgress>[],
  {
    verbose,
    theme: _theme,
    tools: _tools,
    style: _style,
  }: {
    verbose: boolean;
    theme: ThemeName;
    tools: Tool[];
    style?: 'condensed';
  },
): React.ReactNode {
  const lastProgress = progressMessagesForMessage.at(-1);
  const timeoutMs = lastProgress?.data?.timeoutMs;
  return <BashToolResultMessage content={content} verbose={verbose} timeoutMs={timeoutMs} />;
}

export function renderToolUseErrorMessage(
  result: ToolResultBlockParam['content'],
  {
    verbose,
    progressMessagesForMessage: _progressMessagesForMessage,
    tools: _tools,
  }: {
    verbose: boolean;
    progressMessagesForMessage: ProgressMessage<BashProgress>[];
    tools: Tool[];
  },
): React.ReactNode {
  return <FallbackToolUseErrorMessage result={result} verbose={verbose} />;
}
