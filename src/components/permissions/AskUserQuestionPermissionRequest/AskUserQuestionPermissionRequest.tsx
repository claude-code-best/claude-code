import type {
  Base64ImageSource,
  ImageBlockParam,
} from '@anthropic-ai/sdk/resources/messages.mjs'
import React, {
  Suspense,
  use,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useSettings } from '../../../hooks/useSettings.js'
import { useTerminalSize } from '../../../hooks/useTerminalSize.js'
import { stringWidth, useTheme } from '@anthropic/ink'
import { useKeybindings } from '../../../keybindings/useKeybinding.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../../services/analytics/index.js'
import { useAppState } from '../../../state/AppState.js'
import type { Question } from '@claude-code-best/builtin-tools/tools/AskUserQuestionTool/AskUserQuestionTool.js'
import { AskUserQuestionTool } from '@claude-code-best/builtin-tools/tools/AskUserQuestionTool/AskUserQuestionTool.js'
import {
  type CliHighlight,
  getCliHighlightPromise,
} from '../../../utils/cliHighlight.js'
import type { PastedContent } from '../../../utils/config.js'
import type { ImageDimensions } from '../../../utils/imageResizer.js'
import { maybeResizeAndDownsampleImageBlock } from '../../../utils/imageResizer.js'
import { cacheImagePath, storeImage } from '../../../utils/imageStore.js'
import { logError } from '../../../utils/log.js'
import { applyMarkdown } from '../../../utils/markdown.js'
import { isPlanModeInterviewPhaseEnabled } from '../../../utils/planModeV2.js'
import { getPlanFilePath } from '../../../utils/plans.js'
import type { PermissionRequestProps } from '../PermissionRequest.js'
import { QuestionView } from './QuestionView.js'
import { SubmitQuestionsView } from './SubmitQuestionsView.js'
import { useMultipleChoiceState } from './use-multiple-choice-state.js'

const MIN_CONTENT_HEIGHT = 12
const MIN_CONTENT_WIDTH = 40
// Lines used by chrome around the content area (nav bar, title, footer, help text, etc.)
const CONTENT_CHROME_OVERHEAD = 15

export function AskUserQuestionPermissionRequest(
  props: PermissionRequestProps,
): React.ReactNode {
  const settings = useSettings()
  if (settings.syntaxHighlightingDisabled) {
    return <AskUserQuestionPermissionRequestBody {...props} highlight={null} />
  }
  return (
    <Suspense
      fallback={
        <AskUserQuestionPermissionRequestBody {...props} highlight={null} />
      }
    >
      <AskUserQuestionWithHighlight {...props} />
    </Suspense>
  )
}

function AskUserQuestionWithHighlight(
  props: PermissionRequestProps,
): React.ReactNode {
  const highlight = use(getCliHighlightPromise())
  return (
    <AskUserQuestionPermissionRequestBody {...props} highlight={highlight} />
  )
}

function AskUserQuestionPermissionRequestBody({
  toolUseConfirm,
  onDone,
  onReject,
  highlight,
}: PermissionRequestProps & {
  highlight: CliHighlight | null
}): React.ReactNode {
  // Memoize parse result: safeParse returns a new object (and new `questions`
  // array) on every call. Without this, the render-body ref writes below make
  // React Compiler bail out on this component, so nothing is auto-memoized —
  // `questions` changes identity every render, and the `globalContentHeight`
  // useMemo (which runs applyMarkdown over every preview) never hits its cache.
  // `toolUseConfirm.input` is stable for the dialog's lifetime (this tool
  // returns `behavior: 'ask'` directly and never goes through the classifier).
  const result = useMemo(
    () => AskUserQuestionTool.inputSchema.safeParse(toolUseConfirm.input),
    [toolUseConfirm.input],
  )
  const questions = result.success ? result.data.questions || [] : []
  const { rows: terminalRows } = useTerminalSize()
  const [theme] = useTheme()

  // Calculate consistent content dimensions across all questions to prevent layout shifts.
  // globalContentHeight represents the total height of the content area below the nav/title,
  // INCLUDING footer and help text, so all views (questions, previews, submit) match.
  const { globalContentHeight, globalContentWidth } = useMemo(() => {
    let maxHeight = 0
    let maxWidth = 0

    // Footer (divider + "Chat about this" + optional plan) + help text ≈ 7 lines
    const FOOTER_HELP_LINES = 7

    // Cap at terminal height minus chrome overhead, but ensure at least MIN_CONTENT_HEIGHT
    const maxAllowedHeight = Math.max(
      MIN_CONTENT_HEIGHT,
      terminalRows - CONTENT_CHROME_OVERHEAD,
    )

    // PREVIEW_OVERHEAD matches the constant in PreviewQuestionView.tsx — lines
    // used by non-preview elements within the content area (margins, borders,
    // notes, footer, help text). Used here to cap preview content so that
    // globalContentHeight reflects the *truncated* height, not the raw height.
    const PREVIEW_OVERHEAD = 11

    for (const q of questions) {
      const hasPreview = q.options.some(opt => opt.preview)

      if (hasPreview) {
        // Compute the max preview content lines that would actually display
        // after truncation, matching the logic in PreviewQuestionView.
        const maxPreviewContentLines = Math.max(
          1,
          maxAllowedHeight - PREVIEW_OVERHEAD,
        )

        // For preview questions, total = side-by-side height + footer/help
        // Side-by-side = max(left panel, right panel)
        // Right panel = preview box (content + borders + truncation indicator) + notes
        let maxPreviewBoxHeight = 0
        for (const opt of q.options) {
          if (opt.preview) {
            // Measure the *rendered* markdown (same transform as PreviewBox) so
            // that line counts and widths match what will actually be displayed.
            // applyMarkdown removes code fence markers, bold/italic syntax, etc.
            const rendered = applyMarkdown(opt.preview, theme, highlight)
            const previewLines = rendered.split('\n')
            const isTruncated = previewLines.length > maxPreviewContentLines
            const displayedLines = isTruncated
              ? maxPreviewContentLines
              : previewLines.length
            // Preview box: displayed content + truncation indicator + 2 borders
            maxPreviewBoxHeight = Math.max(
              maxPreviewBoxHeight,
              displayedLines + (isTruncated ? 1 : 0) + 2,
            )
            for (const line of previewLines) {
              maxWidth = Math.max(maxWidth, stringWidth(line))
            }
          }
        }
        // Right panel: preview box + notes (2 lines with margin)
        const rightPanelHeight = maxPreviewBoxHeight + 2
        // Left panel: options + description
        const leftPanelHeight = q.options.length + 2
        const sideByHeight = Math.max(leftPanelHeight, rightPanelHeight)
        maxHeight = Math.max(maxHeight, sideByHeight + FOOTER_HELP_LINES)
      } else {
        // For regular questions: options + "Other" + footer/help
        maxHeight = Math.max(
          maxHeight,
          q.options.length + 3 + FOOTER_HELP_LINES,
        )
      }
    }

    return {
      globalContentHeight: Math.min(
        Math.max(maxHeight, MIN_CONTENT_HEIGHT),
        maxAllowedHeight,
      ),
      globalContentWidth: Math.max(maxWidth, MIN_CONTENT_WIDTH),
    }
  }, [questions, terminalRows, theme, highlight])
  const metadataSource = result.success
    ? result.data.metadata?.source
    : undefined

  const [pastedContentsByQuestion, setPastedContentsByQuestion] = useState<
    Record<string, Record<number, PastedContent>>
  >({})
  const nextPasteIdRef = useRef(0)

  function onImagePaste(
    questionText: string,
    base64Image: string,
    mediaType?: string,
    filename?: string,
    dimensions?: ImageDimensions,
    _sourcePath?: string,
  ) {
    const pasteId = nextPasteIdRef.current++
    const newContent: PastedContent = {
      id: pasteId,
      type: 'image',
      content: base64Image,
      mediaType: mediaType || 'image/png',
      filename: filename || 'Pasted image',
      dimensions,
    }
    cacheImagePath(newContent)
    void storeImage(newContent)
    setPastedContentsByQuestion(prev => ({
      ...prev,
      [questionText]: { ...(prev[questionText] ?? {}), [pasteId]: newContent },
    }))
  }

  const onRemoveImage = useCallback((questionText: string, id: number) => {
    setPastedContentsByQuestion(prev => {
      const questionContents = { ...(prev[questionText] ?? {}) }
      delete questionContents[id]
      return { ...prev, [questionText]: questionContents }
    })
  }, [])

  const allImageAttachments = Object.values(pastedContentsByQuestion)
    .flatMap(contents => Object.values(contents))
    .filter(c => c.type === 'image')

  const toolPermissionContextMode = useAppState(
    s => s.toolPermissionContext.mode,
  )
  const isInPlanMode = toolPermissionContextMode === 'plan'
  const planFilePath = isInPlanMode ? getPlanFilePath() : undefined

  const state = useMultipleChoiceState()
  const {
    currentQuestionIndex,
    answers,
    questionStates,
    isInTextInput,
    nextQuestion,
    prevQuestion,
    updateQuestionState,
    setAnswer,
    setTextInputMode,
  } = state

  const currentQuestion =
    currentQuestionIndex < (questions?.length || 0)
      ? questions?.[currentQuestionIndex]
      : null

  const isInSubmitView = currentQuestionIndex === (questions?.length || 0)
  const allQuestionsAnswered =
    questions?.every((q: Question) => q?.question && !!answers[q.question]) ??
    false

  // Hide submit tab when there's only one question and it's single-select (auto-submit scenario)
  const hideSubmitTab = questions.length === 1 && !questions[0]?.multiSelect

  const handleCancel = useCallback(() => {
    // Log rejection with metadata source if present
    if (metadataSource) {
      logEvent('tengu_ask_user_question_rejected', {
        source:
          metadataSource as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        questionCount: questions.length,
        isInPlanMode,
        interviewPhaseEnabled:
          isInPlanMode && isPlanModeInterviewPhaseEnabled(),
      })
    }
    onDone()
    onReject()
    toolUseConfirm.onReject()
  }, [
    onDone,
    onReject,
    toolUseConfirm,
    metadataSource,
    questions.length,
    isInPlanMode,
  ])

  const handleRespondToClaude = useCallback(async () => {
    const questionsWithAnswers = questions
      .map((q: Question) => {
        const answer = answers[q.question]
        if (answer) {
          return `- "${q.question}"\n  Answer: ${answer}`
        }
        return `- "${q.question}"\n  (No answer provided)`
      })
      .join('\n')

    const feedback = `The user wants to clarify these questions.
    This means they may have additional information, context or questions for you.
    Take their response into account and then reformulate the questions if appropriate.
    Start by asking them what they would like to clarify.

    Questions asked:\n${questionsWithAnswers}`

    if (metadataSource) {
      logEvent('tengu_ask_user_question_respond_to_claude', {
        source:
          metadataSource as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        questionCount: questions.length,
        isInPlanMode,
        interviewPhaseEnabled:
          isInPlanMode && isPlanModeInterviewPhaseEnabled(),
      })
    }

    const imageBlocks = await convertImagesToBlocks(allImageAttachments)

    onDone()
    toolUseConfirm.onReject(
      feedback,
      imageBlocks && imageBlocks.length > 0 ? imageBlocks : undefined,
    )
  }, [
    questions,
    answers,
    onDone,
    toolUseConfirm,
    metadataSource,
    isInPlanMode,
    allImageAttachments,
  ])

  const handleFinishPlanInterview = useCallback(async () => {
    const questionsWithAnswers = questions
      .map((q: Question) => {
        const answer = answers[q.question]
        if (answer) {
          return `- "${q.question}"\n  Answer: ${answer}`
        }
        return `- "${q.question}"\n  (No answer provided)`
      })
      .join('\n')

    const feedback = `The user has indicated they have provided enough answers for the plan interview.
Stop asking clarifying questions and proceed to finish the plan with the information you have.

Questions asked and answers provided:\n${questionsWithAnswers}`

    if (metadataSource) {
      logEvent('tengu_ask_user_question_finish_plan_interview', {
        source:
          metadataSource as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        questionCount: questions.length,
        isInPlanMode,
        interviewPhaseEnabled:
          isInPlanMode && isPlanModeInterviewPhaseEnabled(),
      })
    }

    const imageBlocks = await convertImagesToBlocks(allImageAttachments)

    onDone()
    toolUseConfirm.onReject(
      feedback,
      imageBlocks && imageBlocks.length > 0 ? imageBlocks : undefined,
    )
  }, [
    questions,
    answers,
    onDone,
    toolUseConfirm,
    metadataSource,
    isInPlanMode,
    allImageAttachments,
  ])

  const submitAnswers = useCallback(
    async (answersToSubmit: Record<string, string>) => {
      // Log acceptance with metadata source if present
      if (metadataSource) {
        logEvent('tengu_ask_user_question_accepted', {
          source:
            metadataSource as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          questionCount: questions.length,
          answerCount: Object.keys(answersToSubmit).length,
          isInPlanMode,
          interviewPhaseEnabled:
            isInPlanMode && isPlanModeInterviewPhaseEnabled(),
        })
      }
      // Build annotations from questionStates (e.g., selected preview, user notes)
      const annotations: Record<string, { preview?: string; notes?: string }> =
        {}
      for (const q of questions) {
        const answer = answersToSubmit[q.question]
        const notes = questionStates[q.question]?.textInputValue
        // Find the selected option's preview content
        const selectedOption = answer
          ? q.options.find(opt => opt.label === answer)
          : undefined
        const preview = selectedOption?.preview
        if (preview || notes?.trim()) {
          annotations[q.question] = {
            ...(preview && { preview }),
            ...(notes?.trim() && { notes: notes.trim() }),
          }
        }
      }

      const updatedInput = {
        ...toolUseConfirm.input,
        answers: answersToSubmit,
        ...(Object.keys(annotations).length > 0 && { annotations }),
      }

      const contentBlocks = await convertImagesToBlocks(allImageAttachments)

      onDone()
      toolUseConfirm.onAllow(
        updatedInput,
        [],
        undefined,
        contentBlocks && contentBlocks.length > 0 ? contentBlocks : undefined,
      )
    },
    [
      toolUseConfirm,
      onDone,
      metadataSource,
      questions,
      questionStates,
      isInPlanMode,
      allImageAttachments,
    ],
  )

  const handleQuestionAnswer = useCallback(
    (
      questionText: string,
      label: string | string[],
      textInput?: string,
      shouldAdvance: boolean = true,
    ) => {
      let answer: string
      const isMultiSelect = Array.isArray(label)
      if (isMultiSelect) {
        answer = label.join(', ')
      } else {
        if (textInput) {
          const questionImages = Object.values(
            pastedContentsByQuestion[questionText] ?? {},
          ).filter(c => c.type === 'image')
          answer =
            questionImages.length > 0
              ? `${textInput} (Image attached)`
              : textInput
        } else if (label === '__other__') {
          // Image-only submission — check if this question has images
          const questionImages = Object.values(
            pastedContentsByQuestion[questionText] ?? {},
          ).filter(c => c.type === 'image')
          answer = questionImages.length > 0 ? '(Image attached)' : label
        } else {
          answer = label
        }
      }

      // For single-select with only one question, auto-submit instead of showing review screen
      const isSingleQuestion = questions.length === 1
      if (!isMultiSelect && isSingleQuestion && shouldAdvance) {
        const updatedAnswers = {
          ...answers,
          [questionText]: answer,
        }
        void submitAnswers(updatedAnswers).catch(logError)
        return
      }

      setAnswer(questionText, answer, shouldAdvance)
    },
    [
      setAnswer,
      questions.length,
      answers,
      submitAnswers,
      pastedContentsByQuestion,
    ],
  )

  function handleFinalResponse(value: 'submit' | 'cancel'): void {
    if (value === 'cancel') {
      handleCancel()
      return
    }

    if (value === 'submit') {
      void submitAnswers(answers).catch(logError)
    }
  }

  // When submit tab is hidden, don't allow navigating past the last question
  const maxIndex = hideSubmitTab
    ? (questions?.length || 1) - 1
    : questions?.length || 0

  // Bounded navigation callbacks for question tabs
  const handleTabPrev = useCallback(() => {
    if (currentQuestionIndex > 0) {
      prevQuestion()
    }
  }, [currentQuestionIndex, prevQuestion])

  const handleTabNext = useCallback(() => {
    if (currentQuestionIndex < maxIndex) {
      nextQuestion()
    }
  }, [currentQuestionIndex, maxIndex, nextQuestion])

  // Use keybindings system for question navigation (left/right arrows, tab/shift+tab)
  // Raw useInput doesn't work because the keybinding system resolves left/right arrows
  // to tabs:next/tabs:previous and may stopImmediatePropagation before useInput fires.
  // Child components (e.g., PreviewQuestionView) also register their own tabs:next/tabs:previous
  // keybindings to ensure reliable handling regardless of listener ordering.
  useKeybindings(
    {
      'tabs:previous': handleTabPrev,
      'tabs:next': handleTabNext,
    },
    { context: 'Tabs', isActive: !(isInTextInput && !isInSubmitView) },
  )

  if (currentQuestion) {
    return (
      <>
        <QuestionView
          question={currentQuestion}
          questions={questions}
          currentQuestionIndex={currentQuestionIndex}
          answers={answers}
          questionStates={questionStates}
          hideSubmitTab={hideSubmitTab}
          minContentHeight={globalContentHeight}
          minContentWidth={globalContentWidth}
          planFilePath={planFilePath}
          onUpdateQuestionState={updateQuestionState}
          onAnswer={handleQuestionAnswer}
          onTextInputFocus={setTextInputMode}
          onCancel={handleCancel}
          onSubmit={nextQuestion}
          onTabPrev={handleTabPrev}
          onTabNext={handleTabNext}
          onRespondToClaude={handleRespondToClaude}
          onFinishPlanInterview={handleFinishPlanInterview}
          onImagePaste={(base64, mediaType, filename, dims, path) =>
            onImagePaste(
              currentQuestion.question,
              base64,
              mediaType,
              filename,
              dims,
              path,
            )
          }
          pastedContents={
            pastedContentsByQuestion[currentQuestion.question] ?? {}
          }
          onRemoveImage={id => onRemoveImage(currentQuestion.question, id)}
        />
      </>
    )
  }

  if (isInSubmitView) {
    return (
      <>
        <SubmitQuestionsView
          questions={questions}
          currentQuestionIndex={currentQuestionIndex}
          answers={answers}
          allQuestionsAnswered={allQuestionsAnswered}
          permissionResult={toolUseConfirm.permissionResult}
          minContentHeight={globalContentHeight}
          onFinalResponse={handleFinalResponse}
        />
      </>
    )
  }

  // This should never be reached
  return null
}

async function convertImagesToBlocks(
  images: PastedContent[],
): Promise<ImageBlockParam[] | undefined> {
  if (images.length === 0) return undefined
  return Promise.all(
    images.map(async img => {
      const block: ImageBlockParam = {
        type: 'image',
        source: {
          type: 'base64',
          media_type: (img.mediaType ||
            'image/png') as Base64ImageSource['media_type'],
          data: img.content,
        },
      }
      const resized = await maybeResizeAndDownsampleImageBlock(block)
      return resized.block
    }),
  )
}
