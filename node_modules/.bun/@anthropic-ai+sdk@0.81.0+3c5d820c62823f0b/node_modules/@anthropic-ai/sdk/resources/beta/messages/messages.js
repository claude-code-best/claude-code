"use strict";
// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolError = exports.BetaToolRunner = exports.Messages = void 0;
const tslib_1 = require("../../../internal/tslib.js");
const error_1 = require("../../../error.js");
const resource_1 = require("../../../core/resource.js");
const constants_1 = require("../../../internal/constants.js");
const headers_1 = require("../../../internal/headers.js");
const stainless_helper_header_1 = require("../../../lib/stainless-helper-header.js");
const beta_parser_1 = require("../../../lib/beta-parser.js");
const BetaMessageStream_1 = require("../../../lib/BetaMessageStream.js");
const BetaToolRunner_1 = require("../../../lib/tools/BetaToolRunner.js");
const ToolError_1 = require("../../../lib/tools/ToolError.js");
const BatchesAPI = tslib_1.__importStar(require("./batches.js"));
const batches_1 = require("./batches.js");
const DEPRECATED_MODELS = {
    'claude-1.3': 'November 6th, 2024',
    'claude-1.3-100k': 'November 6th, 2024',
    'claude-instant-1.1': 'November 6th, 2024',
    'claude-instant-1.1-100k': 'November 6th, 2024',
    'claude-instant-1.2': 'November 6th, 2024',
    'claude-3-sonnet-20240229': 'July 21st, 2025',
    'claude-3-opus-20240229': 'January 5th, 2026',
    'claude-2.1': 'July 21st, 2025',
    'claude-2.0': 'July 21st, 2025',
    'claude-3-7-sonnet-latest': 'February 19th, 2026',
    'claude-3-7-sonnet-20250219': 'February 19th, 2026',
};
const MODELS_TO_WARN_WITH_THINKING_ENABLED = ['claude-opus-4-6'];
class Messages extends resource_1.APIResource {
    constructor() {
        super(...arguments);
        this.batches = new BatchesAPI.Batches(this._client);
    }
    create(params, options) {
        // Transform deprecated output_format to output_config.format
        const modifiedParams = transformOutputFormat(params);
        const { betas, ...body } = modifiedParams;
        if (body.model in DEPRECATED_MODELS) {
            console.warn(`The model '${body.model}' is deprecated and will reach end-of-life on ${DEPRECATED_MODELS[body.model]}\nPlease migrate to a newer model. Visit https://docs.anthropic.com/en/docs/resources/model-deprecations for more information.`);
        }
        if (body.model in MODELS_TO_WARN_WITH_THINKING_ENABLED &&
            body.thinking &&
            body.thinking.type === 'enabled') {
            console.warn(`Using Claude with ${body.model} and 'thinking.type=enabled' is deprecated. Use 'thinking.type=adaptive' instead which results in better model performance in our testing: https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking`);
        }
        let timeout = this._client._options.timeout;
        if (!body.stream && timeout == null) {
            const maxNonstreamingTokens = constants_1.MODEL_NONSTREAMING_TOKENS[body.model] ?? undefined;
            timeout = this._client.calculateNonstreamingTimeout(body.max_tokens, maxNonstreamingTokens);
        }
        // Collect helper info from tools and messages
        const helperHeader = (0, stainless_helper_header_1.stainlessHelperHeader)(body.tools, body.messages);
        return this._client.post('/v1/messages?beta=true', {
            body,
            timeout: timeout ?? 600000,
            ...options,
            headers: (0, headers_1.buildHeaders)([
                { ...(betas?.toString() != null ? { 'anthropic-beta': betas?.toString() } : undefined) },
                helperHeader,
                options?.headers,
            ]),
            stream: modifiedParams.stream ?? false,
        });
    }
    /**
     * Send a structured list of input messages with text and/or image content, along with an expected `output_format` and
     * the response will be automatically parsed and available in the `parsed_output` property of the message.
     *
     * @example
     * ```ts
     * const message = await client.beta.messages.parse({
     *   model: 'claude-3-5-sonnet-20241022',
     *   max_tokens: 1024,
     *   messages: [{ role: 'user', content: 'What is 2+2?' }],
     *   output_format: zodOutputFormat(z.object({ answer: z.number() }), 'math'),
     * });
     *
     * console.log(message.parsed_output?.answer); // 4
     * ```
     */
    parse(params, options) {
        options = {
            ...options,
            headers: (0, headers_1.buildHeaders)([
                { 'anthropic-beta': [...(params.betas ?? []), 'structured-outputs-2025-12-15'].toString() },
                options?.headers,
            ]),
        };
        return this.create(params, options).then((message) => (0, beta_parser_1.parseBetaMessage)(message, params, { logger: this._client.logger ?? console }));
    }
    /**
     * Create a Message stream
     */
    stream(body, options) {
        return BetaMessageStream_1.BetaMessageStream.createMessage(this, body, options);
    }
    /**
     * Count the number of tokens in a Message.
     *
     * The Token Count API can be used to count the number of tokens in a Message,
     * including tools, images, and documents, without creating it.
     *
     * Learn more about token counting in our
     * [user guide](https://docs.claude.com/en/docs/build-with-claude/token-counting)
     *
     * @example
     * ```ts
     * const betaMessageTokensCount =
     *   await client.beta.messages.countTokens({
     *     messages: [{ content: 'string', role: 'user' }],
     *     model: 'claude-opus-4-6',
     *   });
     * ```
     */
    countTokens(params, options) {
        // Transform deprecated output_format to output_config.format
        const modifiedParams = transformOutputFormat(params);
        const { betas, ...body } = modifiedParams;
        return this._client.post('/v1/messages/count_tokens?beta=true', {
            body,
            ...options,
            headers: (0, headers_1.buildHeaders)([
                { 'anthropic-beta': [...(betas ?? []), 'token-counting-2024-11-01'].toString() },
                options?.headers,
            ]),
        });
    }
    toolRunner(body, options) {
        return new BetaToolRunner_1.BetaToolRunner(this._client, body, options);
    }
}
exports.Messages = Messages;
/**
 * Transform deprecated output_format to output_config.format
 * Returns a modified copy of the params without mutating the original
 */
function transformOutputFormat(params) {
    if (!params.output_format) {
        return params;
    }
    if (params.output_config?.format) {
        throw new error_1.AnthropicError('Both output_format and output_config.format were provided. ' +
            'Please use only output_config.format (output_format is deprecated).');
    }
    const { output_format, ...rest } = params;
    return {
        ...rest,
        output_config: {
            ...params.output_config,
            format: output_format,
        },
    };
}
var BetaToolRunner_2 = require("../../../lib/tools/BetaToolRunner.js");
Object.defineProperty(exports, "BetaToolRunner", { enumerable: true, get: function () { return BetaToolRunner_2.BetaToolRunner; } });
var ToolError_2 = require("../../../lib/tools/ToolError.js");
Object.defineProperty(exports, "ToolError", { enumerable: true, get: function () { return ToolError_2.ToolError; } });
Messages.Batches = batches_1.Batches;
Messages.BetaToolRunner = BetaToolRunner_1.BetaToolRunner;
Messages.ToolError = ToolError_1.ToolError;
//# sourceMappingURL=messages.js.map