import figures from 'figures';
import React, { useMemo } from 'react';
import { useTerminalSize } from '../../../hooks/useTerminalSize.js';
import { Box, Text, stringWidth } from '@anthropic/ink';
import type { Question } from '@claude-code-best/builtin-tools/tools/AskUserQuestionTool/AskUserQuestionTool.js';
import { truncateToWidth } from '../../../utils/format.js';

type Props = {
  questions: Question[];
  currentQuestionIndex: number;
  answers: Record<string, string>;
  hideSubmitTab?: boolean;
};

export function QuestionNavigationBar({
  questions,
  currentQuestionIndex,
  answers,
  hideSubmitTab = false,
}: Props): React.ReactNode {
  const { columns } = useTerminalSize();

  // Calculate the display text for each tab based on available width
  const tabDisplayTexts = useMemo(() => {
    // Calculate fixed width elements
    const leftArrow = '← ';
    const rightArrow = ' →';
    const submitText = hideSubmitTab ? '' : ` ${figures.tick} Submit `;
    const checkboxWidth = 2; // checkbox + space
    const paddingPerTab = 2; // space before and after each tab text

    const fixedWidth = stringWidth(leftArrow) + stringWidth(rightArrow) + stringWidth(submitText);

    // Available width for all question tabs
    const availableForTabs = columns - fixedWidth;

    if (availableForTabs <= 0) {
      // Terminal too narrow, fallback to minimal display
      return questions.map((q: Question, index: number) => {
        const header = q?.header || `Q${index + 1}`;
        return index === currentQuestionIndex ? header.slice(0, 3) : '';
      });
    }

    // Calculate ideal width for each tab (checkbox + padding + text)
    const tabHeaders = questions.map((q: Question, index: number) => q?.header || `Q${index + 1}`);
    const idealWidths = tabHeaders.map(header => checkboxWidth + paddingPerTab + stringWidth(header));

    // Calculate total ideal width
    const totalIdealWidth = idealWidths.reduce((sum, w) => sum + w, 0);

    // If everything fits, use full headers
    if (totalIdealWidth <= availableForTabs) {
      return tabHeaders;
    }

    // Need to truncate - prioritize current tab
    const currentHeader = tabHeaders[currentQuestionIndex] || '';
    const currentIdealWidth = checkboxWidth + paddingPerTab + stringWidth(currentHeader);

    // Minimum width for other tabs (checkbox + padding + 1 char + ellipsis)
    const minWidthPerTab = checkboxWidth + paddingPerTab + 2; // "X…"

    // Calculate space for current tab (try to show full text)
    const currentTabWidth = Math.min(currentIdealWidth, availableForTabs / 2);
    const remainingWidth = availableForTabs - currentTabWidth;

    // Calculate space for other tabs
    const otherTabCount = questions.length - 1;
    const widthPerOtherTab = Math.max(minWidthPerTab, Math.floor(remainingWidth / Math.max(otherTabCount, 1)));

    return tabHeaders.map((header, index) => {
      if (index === currentQuestionIndex) {
        // Current tab - show as much as possible
        const maxTextWidth = currentTabWidth - checkboxWidth - paddingPerTab;
        return truncateToWidth(header, maxTextWidth);
      } else {
        // Other tabs - truncate to fit
        const maxTextWidth = widthPerOtherTab - checkboxWidth - paddingPerTab;
        return truncateToWidth(header, maxTextWidth);
      }
    });
  }, [questions, currentQuestionIndex, columns, hideSubmitTab]);

  const hideArrows = questions.length === 1 && hideSubmitTab;

  return (
    <Box flexDirection="row" marginBottom={1}>
      {!hideArrows && <Text color={currentQuestionIndex === 0 ? 'inactive' : undefined}>← </Text>}
      {questions.map((q: Question, index: number) => {
        const isSelected = index === currentQuestionIndex;
        const isAnswered = q?.question && !!answers[q.question];
        const checkbox = isAnswered ? figures.checkboxOn : figures.checkboxOff;
        const displayText = tabDisplayTexts[index] || q?.header || `Q${index + 1}`;

        return (
          <Box key={q?.question || `question-${index}`}>
            {isSelected ? (
              <Text backgroundColor="permission" color="inverseText">
                {' '}
                {checkbox} {displayText}{' '}
              </Text>
            ) : (
              <Text>
                {' '}
                {checkbox} {displayText}{' '}
              </Text>
            )}
          </Box>
        );
      })}
      {!hideSubmitTab && (
        <Box key="submit">
          {currentQuestionIndex === questions.length ? (
            <Text backgroundColor="permission" color="inverseText">
              {' '}
              {figures.tick} Submit{' '}
            </Text>
          ) : (
            <Text> {figures.tick} Submit </Text>
          )}
        </Box>
      )}
      {!hideArrows && <Text color={currentQuestionIndex === questions.length ? 'inactive' : undefined}> →</Text>}
    </Box>
  );
}
