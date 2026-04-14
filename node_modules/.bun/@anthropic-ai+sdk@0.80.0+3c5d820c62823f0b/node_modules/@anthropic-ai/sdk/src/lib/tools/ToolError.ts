import { BetaToolResultContentBlockParam } from '../../resources/beta';

/**
 * An error that can be thrown from a tool's `run` method to return structured
 * content blocks as the error result, rather than just a string message.
 *
 * When the ToolRunner catches this error, it will use the `content` property
 * as the tool result with `is_error: true`.
 *
 * @example
 * ```ts
 * const tool = {
 *   name: 'my_tool',
 *   run: async (input) => {
 *     if (somethingWentWrong) {
 *       throw new ToolError([
 *         { type: 'text', text: 'Error details here' },
 *         { type: 'image', source: { type: 'base64', data: '...', media_type: 'image/png' } },
 *       ]);
 *     }
 *     return 'success';
 *   },
 * };
 * ```
 */
export class ToolError extends Error {
  /**
   * The content to return as the tool result. This will be sent back to the model
   * with `is_error: true`.
   */
  readonly content: string | Array<BetaToolResultContentBlockParam>;

  constructor(content: string | Array<BetaToolResultContentBlockParam>) {
    const message =
      typeof content === 'string' ? content : (
        content
          .map((block) => {
            if (block.type === 'text') return block.text;
            return `[${block.type}]`;
          })
          .join(' ')
      );
    super(message);
    this.name = 'ToolError';
    this.content = content;
  }
}
