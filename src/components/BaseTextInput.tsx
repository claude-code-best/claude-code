import React from 'react';
import { renderPlaceholder } from '../hooks/renderPlaceholder.js';
import { usePasteHandler } from '../hooks/usePasteHandler.js';
import { useDeclaredCursor } from '@anthropic/ink';
import { Ansi, Box, Text, useInput } from '@anthropic/ink';
import type { BaseInputState, BaseTextInputProps } from '../types/textInputTypes.js';
import type { TextHighlight } from '../utils/textHighlighting.js';
import { HighlightedInput } from './PromptInput/ShimmeredInput.js';

type BaseTextInputComponentProps = BaseTextInputProps & {
  inputState: BaseInputState;
  children?: React.ReactNode;
  terminalFocus: boolean;
  highlights?: TextHighlight[];
  invert?: (text: string) => string;
  hidePlaceholderText?: boolean;
};

/** * 一个处理渲染和基本输入的文本输入基础组件 */
export function BaseTextInput({
  inputState,
  children,
  terminalFocus,
  invert,
  hidePlaceholderText,
  ...props
}: BaseTextInputComponentProps): React.ReactNode {
  const { onInput, renderedValue, cursorLine, cursorColumn } = inputState;

  // 将原生终端光标停靠在输入光标处。终端模拟器
  // 将 IME 预编辑文本定位在物理光标处，屏幕阅读器/
  // 屏幕放大器会跟踪它——因此停靠在此处可使 CJK 输入显示为
  // 内联，并让辅助工具跟随输入。下面的 Box 引用
  // 是 yoga 布局原点；(cursorLine, cursorColumn) 是相对于它的。
  // 仅在输入框获得焦点、显示其光标，且
  // 终端本身获得焦点时激活。
  const cursorRef = useDeclaredCursor({
    line: cursorLine,
    column: cursorColumn,
    active: Boolean(props.focus && props.showCursor && terminalFocus),
  });

  const { wrappedOnInput, isPasting } = usePasteHandler({
    onPaste: props.onPaste,
    onInput: (input, key) => {
      // 防止粘贴期间 Enter 键触发提交
      if (isPasting && key.return) {
        return;
      }
      onInput(input, key);
    },
    onImagePaste: props.onImagePaste,
  });

  // Notify parent when paste state changes
  const { onIsPastingChange } = props;
  React.useEffect(() => {
    if (onIsPastingChange) {
      onIsPastingChange(isPasting);
    }
  }, [isPasting, onIsPastingChange]);

  const { showPlaceholder, renderedPlaceholder } = renderPlaceholder({
    placeholder: props.placeholder,
    value: props.value,
    showCursor: props.showCursor,
    focus: props.focus,
    terminalFocus,
    invert,
    hidePlaceholderText,
  });

  useInput(wrappedOnInput, { isActive: props.focus });

  // 仅在有值且提供了提示时才显示参数提示
  // 仅在以下情况下显示参数提示：
  // 1. 我们有提示可显示
  // 2. 已输入命令（值不为空）
  // 3. 命令尚未带参数（空格后无文本）
  // 4. 我们确实在输入命令（值以 / 开头）
  const commandWithoutArgs =
    (props.value && props.value.trim().indexOf(' ') === -1) || (props.value && props.value.endsWith(' '));

  const showArgumentHint = Boolean(
    props.argumentHint && props.value && commandWithoutArgs && props.value.startsWith('/'),
  );

  // 过滤掉包含光标位置的高亮
  const cursorFiltered =
    props.showCursor && props.highlights
      ? props.highlights.filter(h => h.dimColor || props.cursorOffset < h.start || props.cursorOffset >= h.end)
      : props.highlights;

  // Adjust highlights for viewport windowing: highlight positions reference the
  // full input text, but renderedValue only contains the windowed subset.
  const { viewportCharOffset, viewportCharEnd } = inputState;
  const filteredHighlights =
    cursorFiltered && viewportCharOffset > 0
      ? cursorFiltered
          .filter(h => h.end > viewportCharOffset && h.start < viewportCharEnd)
          .map(h => ({
            ...h,
            start: Math.max(0, h.start - viewportCharOffset),
            end: h.end - viewportCharOffset,
          }))
      : cursorFiltered;

  const hasHighlights = filteredHighlights && filteredHighlights.length > 0;

  if (hasHighlights) {
    return (
      <Box ref={cursorRef}>
        <HighlightedInput text={renderedValue} highlights={filteredHighlights} />
        {showArgumentHint && (
          <Text dimColor>
            {props.value?.endsWith(' ') ? '' : ' '}
            {props.argumentHint}
          </Text>
        )}
        {children}
      </Box>
    );
  }

  return (
    <Box ref={cursorRef}>
      <Text wrap="truncate-end" dimColor={props.dimColor}>
        {showPlaceholder && props.placeholderElement ? (
          props.placeholderElement
        ) : showPlaceholder && renderedPlaceholder ? (
          <Ansi>{renderedPlaceholder}</Ansi>
        ) : (
          <Ansi>{renderedValue}</Ansi>
        )}
        {showArgumentHint && (
          <Text dimColor>
            {props.value?.endsWith(' ') ? '' : ' '}
            {props.argumentHint}
          </Text>
        )}
        {children}
      </Text>
    </Box>
  );
}
