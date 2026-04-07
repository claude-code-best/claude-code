import figures from 'figures'
import React, { useCallback, useState } from 'react'
import { type KeyboardEvent, Box, Text } from '@anthropic/ink'
import { useAppState } from '../../../state/AppState.js'
import type {
  Question,
  QuestionOption,
} from '../../../tools/AskUserQuestionTool/AskUserQuestionTool.js'
import type { PastedContent } from '../../../utils/config.js'
import { getExternalEditor } from '../../../utils/editor.js'
import { toIDEDisplayName } from '../../../utils/ide.js'
import type { ImageDimensions } from '../../../utils/imageResizer.js'
import { editPromptInEditor } from '../../../utils/promptEditor.js'
import {
  type OptionWithDescription,
  Select,
  SelectMulti,
} from '../../CustomSelect/index.js'
import { Divider } from '@anthropic/ink'
import { FilePathLink } from '../../FilePathLink.js'

import { PermissionRequestTitle } from '../PermissionRequestTitle.js'
import { PreviewQuestionView } from './PreviewQuestionView.js'
import { QuestionNavigationBar } from './QuestionNavigationBar.js'
import type { QuestionState } from './use-multiple-choice-state.js'

type Props = {
  question: Question
  questions: Question[]
  currentQuestionIndex: number
  answers: Record<string, string>
  questionStates: Record<string, QuestionState>
  hideSubmitTab?: boolean
  planFilePath?: string
  pastedContents?: Record<number, PastedContent>
  minContentHeight?: number
  minContentWidth?: number
  onUpdateQuestionState: (
    questionText: string,
    updates: Partial<QuestionState>,
    isMultiSelect: boolean,
  ) => void
  onAnswer: (
    questionText: string,
    label: string | string[],
    textInput?: string,
    shouldAdvance?: boolean,
  ) => void
  onTextInputFocus: (isInInput: boolean) => void
  onCancel: () => void
  onSubmit: () => void
  onTabPrev?: () => void
  onTabNext?: () => void
  onRespondToClaude: () => void
  onFinishPlanInterview: () => void
  onImagePaste?: (
    base64Image: string,
    mediaType?: string,
    filename?: string,
    dimensions?: ImageDimensions,
    sourcePath?: string,
  ) => void
  onRemoveImage?: (id: number) => void
}

export function QuestionView({
  question,
  questions,
  currentQuestionIndex,
  answers,
  questionStates,
  hideSubmitTab = false,
  planFilePath,
  minContentHeight,
  minContentWidth,
  onUpdateQuestionState,
  onAnswer,
  onTextInputFocus,
  onCancel,
  onSubmit,
  onTabPrev,
  onTabNext,
  onRespondToClaude,
  onFinishPlanInterview,
  onImagePaste,
  pastedContents,
  onRemoveImage,
}: Props): React.ReactNode {
  const isInPlanMode = useAppState(s => s.toolPermissionContext.mode) === 'plan'
  const [isFooterFocused, setIsFooterFocused] = useState(false)
  const [footerIndex, setFooterIndex] = useState(0)
  const [isOtherFocused, setIsOtherFocused] = useState(false)

  const editor = getExternalEditor()
  const editorName = editor ? toIDEDisplayName(editor) : null

  const handleFocus = useCallback(
    (value: string) => {
      const isOther = value === '__other__'
      setIsOtherFocused(isOther)
      onTextInputFocus(isOther)
    },
    [onTextInputFocus],
  )

  const handleDownFromLastItem = useCallback(() => {
    setIsFooterFocused(true)
  }, [])

  const handleUpFromFooter = useCallback(() => {
    setIsFooterFocused(false)
  }, [])

  // Handle keyboard input when footer is focused
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isFooterFocused) return

      if (e.key === 'up' || (e.ctrl && e.key === 'p')) {
        e.preventDefault()
        if (footerIndex === 0) {
          handleUpFromFooter()
        } else {
          setFooterIndex(0)
        }
        return
      }

      if (e.key === 'down' || (e.ctrl && e.key === 'n')) {
        e.preventDefault()
        if (isInPlanMode && footerIndex === 0) {
          setFooterIndex(1)
        }
        return
      }

      if (e.key === 'return') {
        e.preventDefault()
        if (footerIndex === 0) {
          onRespondToClaude()
        } else {
          onFinishPlanInterview()
        }
        return
      }

      if (e.key === 'escape') {
        e.preventDefault()
        onCancel()
      }
    },
    [
      isFooterFocused,
      footerIndex,
      isInPlanMode,
      handleUpFromFooter,
      onRespondToClaude,
      onFinishPlanInterview,
      onCancel,
    ],
  )

  const textOptions: OptionWithDescription<string>[] = question.options.map(
    (opt: QuestionOption) => ({
      type: 'text' as const,
      value: opt.label,
      label: opt.label,
      description: opt.description,
    }),
  )

  const questionText = question.question
  const questionState = questionStates[questionText]

  const handleOpenEditor = useCallback(
    async (currentValue: string, setValue: (value: string) => void) => {
      const result = await editPromptInEditor(currentValue)

      if (result.content !== null && result.content !== currentValue) {
        // Update the Select's internal state for immediate UI update
        setValue(result.content)
        // Also update the question state for persistence
        onUpdateQuestionState(
          questionText,
          { textInputValue: result.content },
          question.multiSelect ?? false,
        )
      }
    },
    [questionText, onUpdateQuestionState, question.multiSelect],
  )

  const otherOption: OptionWithDescription<string> = {
    type: 'input' as const,
    value: '__other__',
    label: 'Other',
    placeholder: question.multiSelect ? 'Type something' : 'Type something.',
    initialValue: questionState?.textInputValue ?? '',
    onChange: (value: string) => {
      onUpdateQuestionState(
        questionText,
        { textInputValue: value },
        question.multiSelect ?? false,
      )
    },
  }

  const options = [...textOptions, otherOption]

  // Check if any option has a preview and it's not multi-select
  // Previews only supported for single-select questions
  const hasAnyPreview =
    !question.multiSelect && question.options.some(opt => opt.preview)

  // Delegate to PreviewQuestionView for carousel-style preview mode
  if (hasAnyPreview) {
    return (
      <PreviewQuestionView
        question={question}
        questions={questions}
        currentQuestionIndex={currentQuestionIndex}
        answers={answers}
        questionStates={questionStates}
        hideSubmitTab={hideSubmitTab}
        minContentHeight={minContentHeight}
        minContentWidth={minContentWidth}
        onUpdateQuestionState={onUpdateQuestionState}
        onAnswer={onAnswer}
        onTextInputFocus={onTextInputFocus}
        onCancel={onCancel}
        onTabPrev={onTabPrev}
        onTabNext={onTabNext}
        onRespondToClaude={onRespondToClaude}
        onFinishPlanInterview={onFinishPlanInterview}
      />
    )
  }

  return (
    <Box
      flexDirection="column"
      marginTop={0}
      tabIndex={0}
      autoFocus
      onKeyDown={handleKeyDown}
    >
      {isInPlanMode && planFilePath && (
        <Box flexDirection="column" gap={0}>
          <Divider color="inactive" />
          <Text color="inactive">
            Planning: <FilePathLink filePath={planFilePath} />
          </Text>
        </Box>
      )}
      <Box marginTop={-1}>
        <Divider color="inactive" />
      </Box>
      <Box flexDirection="column" paddingTop={0}>
        <QuestionNavigationBar
          questions={questions}
          currentQuestionIndex={currentQuestionIndex}
          answers={answers}
          hideSubmitTab={hideSubmitTab}
        />
        <PermissionRequestTitle title={question.question} color={'text'} />

        <Box flexDirection="column" minHeight={minContentHeight}>
          <Box marginTop={1}>
            {question.multiSelect ? (
              <SelectMulti
                key={question.question}
                options={options}
                defaultValue={
                  questionStates[question.question]?.selectedValue as
                    | string[]
                    | undefined
                }
                onChange={(values: string[]) => {
                  onUpdateQuestionState(
                    questionText,
                    { selectedValue: values },
                    true,
                  )
                  const textInput = values.includes('__other__')
                    ? questionStates[questionText]?.textInputValue
                    : undefined
                  const finalValues = values
                    .filter(v => v !== '__other__')
                    .concat(textInput ? [textInput] : [])
                  onAnswer(questionText, finalValues, undefined, false)
                }}
                onFocus={handleFocus}
                onCancel={onCancel}
                submitButtonText={
                  currentQuestionIndex === questions.length - 1
                    ? 'Submit'
                    : 'Next'
                }
                onSubmit={onSubmit}
                onDownFromLastItem={handleDownFromLastItem}
                isDisabled={isFooterFocused}
                onOpenEditor={handleOpenEditor}
                onImagePaste={onImagePaste}
                pastedContents={pastedContents}
                onRemoveImage={onRemoveImage}
              />
            ) : (
              <Select
                key={question.question}
                options={options}
                defaultValue={
                  questionStates[question.question]?.selectedValue as
                    | string
                    | undefined
                }
                onChange={(value: string) => {
                  onUpdateQuestionState(
                    questionText,
                    { selectedValue: value },
                    false,
                  )
                  const textInput =
                    value === '__other__'
                      ? questionStates[questionText]?.textInputValue
                      : undefined
                  onAnswer(questionText, value, textInput)
                }}
                onFocus={handleFocus}
                onCancel={onCancel}
                onDownFromLastItem={handleDownFromLastItem}
                isDisabled={isFooterFocused}
                layout="compact-vertical"
                onOpenEditor={handleOpenEditor}
                onImagePaste={onImagePaste}
                pastedContents={pastedContents}
                onRemoveImage={onRemoveImage}
              />
            )}
          </Box>
          {/* Footer section - always visible, separate from Select */}
          <Box flexDirection="column">
            <Divider color="inactive" />
            <Box flexDirection="row" gap={1}>
              {isFooterFocused && footerIndex === 0 ? (
                <Text color="suggestion">{figures.pointer}</Text>
              ) : (
                <Text> </Text>
              )}
              <Text
                color={
                  isFooterFocused && footerIndex === 0
                    ? 'suggestion'
                    : undefined
                }
              >
                {options.length + 1}. Chat about this
              </Text>
            </Box>
            {isInPlanMode && (
              <Box flexDirection="row" gap={1}>
                {isFooterFocused && footerIndex === 1 ? (
                  <Text color="suggestion">{figures.pointer}</Text>
                ) : (
                  <Text> </Text>
                )}
                <Text
                  color={
                    isFooterFocused && footerIndex === 1
                      ? 'suggestion'
                      : undefined
                  }
                >
                  {options.length + 2}. Skip interview and plan immediately
                </Text>
              </Box>
            )}
          </Box>
          <Box marginTop={1}>
            <Text color="inactive" dimColor>
              Enter to select ·{' '}
              {questions.length === 1 ? (
                <>
                  {figures.arrowUp}/{figures.arrowDown} to navigate
                </>
              ) : (
                'Tab/Arrow keys to navigate'
              )}
              {isOtherFocused && editorName && (
                <> · ctrl+g to edit in {editorName}</>
              )}{' '}
              · Esc to cancel
            </Text>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
