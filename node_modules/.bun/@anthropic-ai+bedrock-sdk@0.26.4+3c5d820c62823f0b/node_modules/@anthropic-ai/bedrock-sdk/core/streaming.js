"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Stream = exports.getMinimalSerdeContext = exports.fromUtf8 = exports.toUtf8 = void 0;
const eventstream_serde_node_1 = require("@smithy/eventstream-serde-node");
const util_base64_1 = require("@smithy/util-base64");
const fetch_http_handler_1 = require("@smithy/fetch-http-handler");
const streaming_1 = require("@anthropic-ai/sdk/streaming");
const error_1 = require("@anthropic-ai/sdk/error");
const sdk_1 = require("@anthropic-ai/sdk");
const AWS_restJson1_1 = require("../AWS_restJson1.js");
const shims_1 = require("../internal/shims.js");
const values_1 = require("../internal/utils/values.js");
const log_1 = require("../internal/utils/log.js");
const toUtf8 = (input) => new TextDecoder('utf-8').decode(input);
exports.toUtf8 = toUtf8;
const fromUtf8 = (input) => new TextEncoder().encode(input);
exports.fromUtf8 = fromUtf8;
// `de_ResponseStream` parses a Bedrock response stream and emits events as they are found.
// It requires a "context" argument which has many fields, but for what we're using it for
// it only needs this.
const getMinimalSerdeContext = () => {
    const marshaller = new eventstream_serde_node_1.EventStreamMarshaller({ utf8Encoder: exports.toUtf8, utf8Decoder: exports.fromUtf8 });
    return {
        base64Decoder: util_base64_1.fromBase64,
        base64Encoder: util_base64_1.toBase64,
        utf8Decoder: exports.fromUtf8,
        utf8Encoder: exports.toUtf8,
        eventStreamMarshaller: marshaller,
        streamCollector: fetch_http_handler_1.streamCollector,
    };
};
exports.getMinimalSerdeContext = getMinimalSerdeContext;
class Stream extends streaming_1.Stream {
    static fromSSEResponse(response, controller, client) {
        let consumed = false;
        const logger = client ? (0, log_1.loggerFor)(client) : console;
        async function* iterMessages() {
            if (!response.body) {
                controller.abort();
                throw new error_1.AnthropicError(`Attempted to iterate over a response with no body`);
            }
            const responseBodyIter = (0, shims_1.ReadableStreamToAsyncIterable)(response.body);
            const eventStream = (0, AWS_restJson1_1.de_ResponseStream)(responseBodyIter, (0, exports.getMinimalSerdeContext)());
            for await (const event of eventStream) {
                if (event.chunk && event.chunk.bytes) {
                    const s = (0, exports.toUtf8)(event.chunk.bytes);
                    yield { event: 'chunk', data: s, raw: [] };
                }
                else if (event.internalServerException) {
                    yield { event: 'error', data: 'InternalServerException', raw: [] };
                }
                else if (event.modelStreamErrorException) {
                    yield { event: 'error', data: 'ModelStreamErrorException', raw: [] };
                }
                else if (event.validationException) {
                    yield { event: 'error', data: 'ValidationException', raw: [] };
                }
                else if (event.throttlingException) {
                    yield { event: 'error', data: 'ThrottlingException', raw: [] };
                }
            }
        }
        // Note: this function is copied entirely from the core SDK
        async function* iterator() {
            if (consumed) {
                throw new Error('Cannot iterate over a consumed stream, use `.tee()` to split the stream.');
            }
            consumed = true;
            let done = false;
            try {
                for await (const sse of iterMessages()) {
                    if (sse.event === 'chunk') {
                        try {
                            yield JSON.parse(sse.data);
                        }
                        catch (e) {
                            logger.error(`Could not parse message into JSON:`, sse.data);
                            logger.error(`From chunk:`, sse.raw);
                            throw e;
                        }
                    }
                    if (sse.event === 'error') {
                        const errText = sse.data;
                        const errJSON = (0, values_1.safeJSON)(errText);
                        const errMessage = errJSON ? undefined : errText;
                        throw sdk_1.APIError.generate(undefined, errJSON, errMessage, response.headers);
                    }
                }
                done = true;
            }
            catch (e) {
                // If the user calls `stream.controller.abort()`, we should exit without throwing.
                if (isAbortError(e))
                    return;
                throw e;
            }
            finally {
                // If the user `break`s, abort the ongoing request.
                if (!done)
                    controller.abort();
            }
        }
        return new Stream(iterator, controller);
    }
}
exports.Stream = Stream;
function isAbortError(err) {
    return (typeof err === 'object' &&
        err !== null &&
        // Spec-compliant fetch implementations
        (('name' in err && err.name === 'AbortError') ||
            // Expo fetch
            ('message' in err && String(err.message).includes('FetchRequestCanceledException'))));
}
//# sourceMappingURL=streaming.js.map