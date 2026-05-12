import { z } from 'zod/v4'
import { buildTool, type ToolDef } from 'src/Tool.js'
import { lazySchema } from 'src/utils/lazySchema.js'
import React from 'react'
import { Box, Text } from '@anthropic/ink'

const REVIEW_ARTIFACT_TOOL_NAME = 'ReviewArtifact'

const DESCRIPTION =
  'Review an artifact (code snippet, document, or other content) with inline annotations and feedback.'

const inputSchema = lazySchema(() =>
  z.strictObject({
    artifact: z
      .string()
      .describe(
        'The content of the artifact to review (code snippet, document text, etc.).',
      ),
    title: z
      .string()
      .optional()
      .describe('Optional title or file path for the artifact being reviewed.'),
    annotations: z
      .array(
        z.object({
          line: z
            .number()
            .optional()
            .describe('Line number for the annotation (1-based).'),
          message: z.string().describe('The annotation or feedback message.'),
          severity: z
            .enum(['info', 'warning', 'error', 'suggestion'])
            .optional()
            .describe('Severity level of the annotation.'),
        }),
      )
      .describe('List of annotations/comments on the artifact.'),
    summary: z
      .string()
      .optional()
      .describe('An overall summary of the review.'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    artifact: z.string().describe('The reviewed artifact content.'),
    title: z.string().optional().describe('Title of the reviewed artifact.'),
    annotationCount: z.number().describe('Number of annotations applied.'),
    summary: z.string().optional().describe('Summary of the review.'),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

export const ReviewArtifactTool = buildTool({
  name: REVIEW_ARTIFACT_TOOL_NAME,
  searchHint: 'review code or documents with inline annotations',
  maxResultSizeChars: 100_000,
  async description(input) {
    const { title } = input as { title?: string }
    return title
      ? `Claude wants to review: ${title}`
      : 'Claude wants to review an artifact'
  },
  userFacingName() {
    return 'ReviewArtifact'
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },
  toAutoClassifierInput(input) {
    return input.title ?? input.artifact.slice(0, 200)
  },
  async prompt() {
    return `Use this tool to present a review of a code snippet, document, or other artifact with inline annotations and feedback. Each annotation can target a specific line and include a severity level. ${DESCRIPTION}`
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: `Review delivered with ${output.annotationCount} annotation(s).${output.summary ? ` Summary: ${output.summary}` : ''}`,
    }
  },
  renderToolUseMessage(
    input: Partial<z.infer<InputSchema>>,
    { verbose }: { theme?: string; verbose: boolean },
  ): React.ReactNode {
    const title = input.title ?? 'Untitled artifact'
    const count = input.annotations?.length ?? 0
    if (verbose) {
      return `Review: "${title}" (${count} annotation(s))`
    }
    return title
  },
  renderToolResultMessage(
    output: Output,
    _progressMessages: unknown[],
    { verbose }: { verbose: boolean },
  ): React.ReactNode {
    if (verbose) {
      return React.createElement(
        Box,
        { flexDirection: 'column' },
        React.createElement(
          Text,
          null,
          `Reviewed artifact: ${output.title ?? 'Untitled'} (${output.annotationCount} annotations)`,
        ),
        output.summary
          ? React.createElement(Text, { dimColor: true }, output.summary)
          : null,
      )
    }
    return React.createElement(
      Text,
      null,
      `Review complete: ${output.annotationCount} annotation(s)`,
    )
  },
  async call({ artifact, title, annotations, summary }, _context) {
    const output: Output = {
      artifact,
      title,
      annotationCount: annotations.length,
      summary,
    }
    return { data: output }
  },
} satisfies ToolDef<InputSchema, Output>)
