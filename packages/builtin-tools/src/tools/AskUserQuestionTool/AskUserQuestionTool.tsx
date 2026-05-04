import { feature } from 'bun:bundle';
import * as React from 'react';
import { getAllowedChannels, getQuestionPreviewFormat } from 'src/bootstrap/state.js';
import { MessageResponse } from 'src/components/MessageResponse.js';
import { BLACK_CIRCLE } from 'src/constants/figures.js';
import { getModeColor } from 'src/utils/permissions/PermissionMode.js';
import { z } from 'zod/v4';
import { Box, Text } from '@anthropic/ink';
import type { Tool } from 'src/Tool.js';
import { buildTool, type ToolDef } from 'src/Tool.js';
import { lazySchema } from 'src/utils/lazySchema.js';
import {
  ASK_USER_QUESTION_TOOL_CHIP_WIDTH,
  ASK_USER_QUESTION_TOOL_NAME,
  ASK_USER_QUESTION_TOOL_PROMPT,
  DESCRIPTION,
  PREVIEW_FEATURE_PROMPT,
} from './prompt.js';

const questionOptionSchema = lazySchema(() =>
  z.object({
    label: z.string().describe('此选项的显示文本，用户将看到并选择。应简洁（1-5 个词）并清晰描述选项内容。'),
    description: z.string().describe('解释此选项的含义或选择后的结果。用于提供关于权衡或影响的上下文。'),
    preview: z
      .string()
      .optional()
      .describe(
        '当此选项被聚焦时显示的可选预览内容。可用于展示模型草图、代码片段或视觉对比，帮助用户比较选项。预览内容的预期格式请参见工具描述。',
      ),
  }),
);

const questionSchema = lazySchema(() =>
  z.object({
    question: z
      .string()
      .describe(
        '要询问用户的完整问题。应清晰、具体，并以问号结尾。示例："我们应该使用哪个库来格式化日期？" 如果 multiSelect 为 true，请相应调整措辞，例如："您希望启用哪些功能？"',
      ),
    header: z
      .string()
      .describe(
        `极短的标签，以标签/徽章形式显示（最多 ${ASK_USER_QUESTION_TOOL_CHIP_WIDTH} 个字符）。示例："认证方式"、"库"、"方法"。`,
      ),
    options: z
      .array(questionOptionSchema())
      .min(2)
      .max(4)
      .describe(
        `此问题的可用选项。必须有 2-4 个选项。每个选项应是互斥的不同选项（除非启用了 multiSelect）。不提供"其他"选项，系统会自动提供。`,
      ),
    multiSelect: z
      .boolean()
      .default(false)
      .describe('设为 true 以允许用户选择多个选项，而不是只能选一个。当选项非互斥时使用。'),
  }),
);

const annotationsSchema = lazySchema(() => {
  const annotationSchema = z.object({
    preview: z
      .string()
      .optional()
      .describe('The preview content of the selected option, if the question used previews.'),
    notes: z.string().optional().describe('Free-text notes the user added to their selection.'),
  });

  return z
    .record(z.string(), annotationSchema)
    .optional()
    .describe(
      'Optional per-question annotations from the user (e.g., notes on preview selections). Keyed by question text.',
    );
});

const UNIQUENESS_REFINE = {
  check: (data: { questions: { question: string; options: { label: string }[] }[] }) => {
    const questions = data.questions.map(q => q.question);
    if (questions.length !== new Set(questions).size) {
      return false;
    }
    for (const question of data.questions) {
      const labels = question.options.map(opt => opt.label);
      if (labels.length !== new Set(labels).size) {
        return false;
      }
    }
    return true;
  },
  message: 'Question texts must be unique, option labels must be unique within each question',
} as const;

const commonFields = lazySchema(() => ({
  answers: z.record(z.string(), z.string()).optional().describe('User answers collected by the permission component'),
  annotations: annotationsSchema(),
  metadata: z
    .object({
      source: z
        .string()
        .optional()
        .describe('此问题来源的可选标识符（例如，/remember 命令使用 "remember"）。用于分析跟踪。'),
    })
    .optional()
    .describe('Optional metadata for tracking and analytics purposes. Not displayed to user.'),
}));

const inputSchema = lazySchema(() =>
  z
    .strictObject({
      questions: z.array(questionSchema()).min(1).max(4).describe('Questions to ask the user (1-4 questions)'),
      ...commonFields(),
    })
    .refine(UNIQUENESS_REFINE.check, {
      message: UNIQUENESS_REFINE.message,
    }),
);
type InputSchema = ReturnType<typeof inputSchema>;

const outputSchema = lazySchema(() =>
  z.object({
    questions: z.array(questionSchema()).describe('The questions that were asked'),
    answers: z.record(z.string(), z.string()).describe('用户提供的答案（问题文本 -> 答案字符串；多选答案以逗号分隔）'),
    annotations: annotationsSchema(),
  }),
);
type OutputSchema = ReturnType<typeof outputSchema>;

// SDK schemas are identical to internal schemas now that `preview` and
// `annotations` are public (configurable via `toolConfig.askUserQuestion`).
export const _sdkInputSchema = inputSchema;
export const _sdkOutputSchema = outputSchema;

export type Question = z.infer<ReturnType<typeof questionSchema>>;
export type QuestionOption = z.infer<ReturnType<typeof questionOptionSchema>>;
export type Output = z.infer<OutputSchema>;

function AskUserQuestionResultMessage({ answers }: { answers: Output['answers'] }): React.ReactNode {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box flexDirection="row">
        <Text color={getModeColor('default')}>{BLACK_CIRCLE}&nbsp;</Text>
        <Text>用户已回答 Claude 的问题：</Text>
      </Box>
      <MessageResponse>
        <Box flexDirection="column">
          {Object.entries(answers).map(([questionText, answer]) => (
            <Text key={questionText} color="inactive">
              · {questionText} → {answer}
            </Text>
          ))}
        </Box>
      </MessageResponse>
    </Box>
  );
}

export const AskUserQuestionTool: Tool<InputSchema, Output> = buildTool({
  name: ASK_USER_QUESTION_TOOL_NAME,
  searchHint: '向用户提出一个多项选择题',
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  async description() {
    return DESCRIPTION;
  },
  async prompt() {
    const format = getQuestionPreviewFormat();
    if (format === undefined) {
      // SDK consumer that hasn't opted into a preview format — omit preview
      // guidance (they may not render the field at all).
      return ASK_USER_QUESTION_TOOL_PROMPT;
    }
    return ASK_USER_QUESTION_TOOL_PROMPT + PREVIEW_FEATURE_PROMPT[format];
  },
  get inputSchema(): InputSchema {
    return inputSchema();
  },
  get outputSchema(): OutputSchema {
    return outputSchema();
  },
  userFacingName() {
    return '';
  },
  isEnabled() {
    // When --channels is active the user is likely on Telegram/Discord, not
    // watching the TUI. The multiple-choice dialog would hang with nobody at
    // the keyboard. Channel permission relay already skips
    // requiresUserInteraction() tools (interactiveHandler.ts) so there's
    // no alternate approval path.
    if ((feature('KAIROS') || feature('KAIROS_CHANNELS')) && getAllowedChannels().length > 0) {
      return false;
    }
    return true;
  },
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return true;
  },
  toAutoClassifierInput(input) {
    return input.questions.map(q => q.question).join(' | ');
  },
  requiresUserInteraction() {
    return true;
  },
  async validateInput({ questions }) {
    if (getQuestionPreviewFormat() !== 'html') {
      return { result: true };
    }
    for (const q of questions) {
      for (const opt of q.options) {
        const err = validateHtmlPreview(opt.preview);
        if (err) {
          return {
            result: false,
            message: `问题“${q.question}”中的选项“${opt.label}”：${err}`,
            errorCode: 1,
          };
        }
      }
    }
    return { result: true };
  },
  async checkPermissions(input) {
    return {
      behavior: 'ask' as const,
      message: '回答问题？',
      updatedInput: input,
    };
  },
  renderToolUseMessage() {
    return null;
  },
  renderToolUseProgressMessage() {
    return null;
  },
  renderToolResultMessage({ answers }, _toolUseID) {
    return <AskUserQuestionResultMessage answers={answers} />;
  },
  renderToolUseRejectedMessage() {
    return (
      <Box flexDirection="row" marginTop={1}>
        <Text color={getModeColor('default')}>{BLACK_CIRCLE}&nbsp;</Text>
        <Text>用户拒绝回答问题</Text>
      </Box>
    );
  },
  renderToolUseErrorMessage() {
    return null;
  },
  async call({ questions, answers = {}, annotations }, _context) {
    return {
      data: { questions, answers, ...(annotations && { annotations }) },
    };
  },
  mapToolResultToToolResultBlockParam({ answers, annotations }, toolUseID) {
    const answersText = Object.entries(answers)
      .map(([questionText, answer]) => {
        const annotation = annotations?.[questionText];
        const parts = [`"${questionText}"="${answer}"`];
        if (annotation?.preview) {
          parts.push(`selected preview:\n${annotation.preview}`);
        }
        if (annotation?.notes) {
          parts.push(`user notes: ${annotation.notes}`);
        }
        return parts.join(' ');
      })
      .join(', ');

    return {
      type: 'tool_result',
      content: `用户已回答您的问题：${answersText}。现在您可以继续考虑用户的答案。`,
      tool_use_id: toolUseID,
    };
  },
} satisfies ToolDef<InputSchema, Output>);

// 轻量级 HTML 片段检查。不是解析器 — HTML5 解析器在规范上是错误恢复的，可以接受任何内容。
// 我们检查模型的意图（它是否生成了 HTML？）并捕获我们告诉它不要做的具体事情。
function validateHtmlPreview(preview: string | undefined): string | null {
  if (preview === undefined) return null;
  if (/<\s*(html|body|!doctype)\b/i.test(preview)) {
    return 'preview must be an HTML fragment, not a full document (no <html>, <body>, or <!DOCTYPE>)';
  }
  // SDK 消费者通常通过 innerHTML 设置 — 不允许可执行/样式标签，以免预览执行代码或重新设置宿主页面样式。
  // 内联事件处理程序（onclick 等）仍然可能；消费者应自行清理。
  if (/<\s*(script|style)\b/i.test(preview)) {
    return 'preview must not contain <script> or <style> tags. Use inline styles via the style attribute if needed.';
  }
  if (!/<[a-z][^>]*>/i.test(preview)) {
    return 'preview must contain HTML (previewFormat is set to "html"). Wrap content in a tag like <div> or <pre>.';
  }
  return null;
}
