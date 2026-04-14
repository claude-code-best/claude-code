import { BetaToolResultContentBlockParam } from "../../resources/beta.js";
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
export declare class ToolError extends Error {
    /**
     * The content to return as the tool result. This will be sent back to the model
     * with `is_error: true`.
     */
    readonly content: string | Array<BetaToolResultContentBlockParam>;
    constructor(content: string | Array<BetaToolResultContentBlockParam>);
}
//# sourceMappingURL=ToolError.d.ts.map