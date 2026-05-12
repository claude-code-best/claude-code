import chalk from 'chalk';
import React from 'react';
import { useClipboardImageHint } from '../hooks/useClipboardImageHint.js';
import { useVimInput } from '../hooks/useVimInput.js';
import { Box, color, useTerminalFocus, useTheme } from '@anthropic/ink';
import type { VimTextInputProps } from '../types/textInputTypes.js';
import type { TextHighlight } from '../utils/textHighlighting.js';
import { BaseTextInput } from './BaseTextInput.js';

export type Props = VimTextInputProps & {
  highlights?: TextHighlight[];
};

export default function VimTextInput(props: Props): React.ReactNode {
  const [theme] = useTheme();
  const isTerminalFocused = useTerminalFocus();

  // Show hint when terminal regains focus and clipboard has an image
  useClipboardImageHint(isTerminalFocused, !!props.onImagePaste);

  const vimInputState = useVimInput({
    value: props.value,
    onChange: props.onChange,
    onSubmit: props.onSubmit,
    onExit: props.onExit,
    onExitMessage: props.onExitMessage,
    onHistoryReset: props.onHistoryReset,
    onHistoryUp: props.onHistoryUp,
    onHistoryDown: props.onHistoryDown,
    onClearInput: props.onClearInput,
    focus: props.focus,
    mask: props.mask,
    multiline: props.multiline,
    cursorChar: props.showCursor ? ' ' : '',
    highlightPastedText: props.highlightPastedText,
    invert: isTerminalFocused ? chalk.inverse : (text: string) => text,
    themeText: color('text', theme),
    columns: props.columns,
    maxVisibleLines: props.maxVisibleLines,
    onImagePaste: props.onImagePaste,
    disableCursorMovementForUpDownKeys: props.disableCursorMovementForUpDownKeys,
    disableEscapeDoublePress: props.disableEscapeDoublePress,
    externalOffset: props.cursorOffset,
    onOffsetChange: props.onChangeCursorOffset,
    inputFilter: props.inputFilter,
    onModeChange: props.onModeChange,
    onUndo: props.onUndo,
  });

  const { mode, setMode } = vimInputState;

  React.useEffect(() => {
    if (props.initialMode && props.initialMode !== mode) {
      setMode(props.initialMode);
    }
  }, [props.initialMode, mode, setMode]);

  return (
    <Box flexDirection="column">
      <BaseTextInput
        inputState={vimInputState}
        terminalFocus={isTerminalFocused}
        highlights={props.highlights}
        {...props}
      />
    </Box>
  );
}
