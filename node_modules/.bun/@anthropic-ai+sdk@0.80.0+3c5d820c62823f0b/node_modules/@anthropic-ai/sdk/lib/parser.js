"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.maybeParseMessage = maybeParseMessage;
exports.parseMessage = parseMessage;
const error_1 = require("../core/error.js");
function getOutputFormat(params) {
    return params?.output_config?.format;
}
function maybeParseMessage(message, params, opts) {
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
                    return parsedBlock;
                }
                return block;
            }),
            parsed_output: null,
        };
    }
    return parseMessage(message, params, opts);
}
function parseMessage(message, params, opts) {
    let firstParsedOutput = null;
    const content = message.content.map((block) => {
        if (block.type === 'text') {
            const parsedOutput = parseOutputFormat(params, block.text);
            if (firstParsedOutput === null) {
                firstParsedOutput = parsedOutput;
            }
            const parsedBlock = Object.defineProperty({ ...block }, 'parsed_output', {
                value: parsedOutput,
                enumerable: false,
            });
            return parsedBlock;
        }
        return block;
    });
    return {
        ...message,
        content,
        parsed_output: firstParsedOutput,
    };
}
function parseOutputFormat(params, content) {
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
//# sourceMappingURL=parser.js.map