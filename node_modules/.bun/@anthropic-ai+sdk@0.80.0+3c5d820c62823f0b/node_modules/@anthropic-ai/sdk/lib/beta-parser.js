"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.maybeParseBetaMessage = maybeParseBetaMessage;
exports.parseBetaMessage = parseBetaMessage;
const error_1 = require("../core/error.js");
function getOutputFormat(params) {
    // Prefer output_format (deprecated) over output_config.format for backward compatibility
    return params?.output_format ?? params?.output_config?.format;
}
function maybeParseBetaMessage(message, params, opts) {
    const outputFormat = getOutputFormat(params);
    if (!params || !('parse' in (outputFormat ?? {}))) {
        return {
            ...message,
            content: message.content.map((block) => {
                if (block.type === 'text') {
                    const parsedBlock = Object.defineProperty({ ...block }, 'parsed_output', {
                        value: null,
                        enumerable: false,
                    });
                    return Object.defineProperty(parsedBlock, 'parsed', {
                        get() {
                            opts.logger.warn('The `parsed` property on `text` blocks is deprecated, please use `parsed_output` instead.');
                            return null;
                        },
                        enumerable: false,
                    });
                }
                return block;
            }),
            parsed_output: null,
        };
    }
    return parseBetaMessage(message, params, opts);
}
function parseBetaMessage(message, params, opts) {
    let firstParsedOutput = null;
    const content = message.content.map((block) => {
        if (block.type === 'text') {
            const parsedOutput = parseBetaOutputFormat(params, block.text);
            if (firstParsedOutput === null) {
                firstParsedOutput = parsedOutput;
            }
            const parsedBlock = Object.defineProperty({ ...block }, 'parsed_output', {
                value: parsedOutput,
                enumerable: false,
            });
            return Object.defineProperty(parsedBlock, 'parsed', {
                get() {
                    opts.logger.warn('The `parsed` property on `text` blocks is deprecated, please use `parsed_output` instead.');
                    return parsedOutput;
                },
                enumerable: false,
            });
        }
        return block;
    });
    return {
        ...message,
        content,
        parsed_output: firstParsedOutput,
    };
}
function parseBetaOutputFormat(params, content) {
    const outputFormat = getOutputFormat(params);
    if (outputFormat?.type !== 'json_schema') {
        return null;
    }
    try {
        if ('parse' in outputFormat) {
            return outputFormat.parse(content);
        }
        return JSON.parse(content);
    }
    catch (error) {
        throw new error_1.AnthropicError(`Failed to parse structured output: ${error}`);
    }
}
//# sourceMappingURL=beta-parser.js.map