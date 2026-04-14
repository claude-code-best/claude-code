"use strict";
// Copied from https://github.com/aws/aws-sdk-js-v3/blob/bee66fbd2a519a16b57c787b2689af857af720af/clients/client-bedrock-runtime/src/protocols/Aws_restJson1.ts
// Modified to remove unnecessary code (we only need to call `de_ResponseStream`) and to adjust imports.
Object.defineProperty(exports, "__esModule", { value: true });
exports.de_ResponseStream = void 0;
const smithy_client_1 = require("@smithy/smithy-client");
const client_bedrock_runtime_1 = require("@aws-sdk/client-bedrock-runtime");
/**
 * deserializeAws_restJson1InternalServerExceptionRes
 */
const de_InternalServerExceptionRes = async (parsedOutput, context) => {
    const contents = (0, smithy_client_1.map)({});
    const data = parsedOutput.body;
    const doc = (0, smithy_client_1.take)(data, {
        message: smithy_client_1.expectString,
    });
    Object.assign(contents, doc);
    const exception = new client_bedrock_runtime_1.InternalServerException({
        $metadata: deserializeMetadata(parsedOutput),
        ...contents,
    });
    return (0, smithy_client_1.decorateServiceException)(exception, parsedOutput.body);
};
/**
 * deserializeAws_restJson1ModelStreamErrorExceptionRes
 */
const de_ModelStreamErrorExceptionRes = async (parsedOutput, context) => {
    const contents = (0, smithy_client_1.map)({});
    const data = parsedOutput.body;
    const doc = (0, smithy_client_1.take)(data, {
        message: smithy_client_1.expectString,
        originalMessage: smithy_client_1.expectString,
        originalStatusCode: smithy_client_1.expectInt32,
    });
    Object.assign(contents, doc);
    const exception = new client_bedrock_runtime_1.ModelStreamErrorException({
        $metadata: deserializeMetadata(parsedOutput),
        ...contents,
    });
    return (0, smithy_client_1.decorateServiceException)(exception, parsedOutput.body);
};
/**
 * deserializeAws_restJson1ThrottlingExceptionRes
 */
const de_ThrottlingExceptionRes = async (parsedOutput, context) => {
    const contents = (0, smithy_client_1.map)({});
    const data = parsedOutput.body;
    const doc = (0, smithy_client_1.take)(data, {
        message: smithy_client_1.expectString,
    });
    Object.assign(contents, doc);
    const exception = new client_bedrock_runtime_1.ThrottlingException({
        $metadata: deserializeMetadata(parsedOutput),
        ...contents,
    });
    return (0, smithy_client_1.decorateServiceException)(exception, parsedOutput.body);
};
/**
 * deserializeAws_restJson1ValidationExceptionRes
 */
const de_ValidationExceptionRes = async (parsedOutput, context) => {
    const contents = (0, smithy_client_1.map)({});
    const data = parsedOutput.body;
    const doc = (0, smithy_client_1.take)(data, {
        message: smithy_client_1.expectString,
    });
    Object.assign(contents, doc);
    const exception = new client_bedrock_runtime_1.ValidationException({
        $metadata: deserializeMetadata(parsedOutput),
        ...contents,
    });
    return (0, smithy_client_1.decorateServiceException)(exception, parsedOutput.body);
};
/**
 * deserializeAws_restJson1ResponseStream
 */
const de_ResponseStream = (output, context) => {
    return context.eventStreamMarshaller.deserialize(output, async (event) => {
        if (event['chunk'] != null) {
            return {
                chunk: await de_PayloadPart_event(event['chunk'], context),
            };
        }
        if (event['internalServerException'] != null) {
            return {
                internalServerException: await de_InternalServerException_event(event['internalServerException'], context),
            };
        }
        if (event['modelStreamErrorException'] != null) {
            return {
                modelStreamErrorException: await de_ModelStreamErrorException_event(event['modelStreamErrorException'], context),
            };
        }
        if (event['validationException'] != null) {
            return {
                validationException: await de_ValidationException_event(event['validationException'], context),
            };
        }
        if (event['throttlingException'] != null) {
            return {
                throttlingException: await de_ThrottlingException_event(event['throttlingException'], context),
            };
        }
        return { $unknown: output };
    });
};
exports.de_ResponseStream = de_ResponseStream;
const de_InternalServerException_event = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await parseBody(output.body, context),
    };
    return de_InternalServerExceptionRes(parsedOutput, context);
};
const de_ModelStreamErrorException_event = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await parseBody(output.body, context),
    };
    return de_ModelStreamErrorExceptionRes(parsedOutput, context);
};
const de_PayloadPart_event = async (output, context) => {
    const contents = {};
    const data = await parseBody(output.body, context);
    Object.assign(contents, de_PayloadPart(data, context));
    return contents;
};
const de_ThrottlingException_event = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await parseBody(output.body, context),
    };
    return de_ThrottlingExceptionRes(parsedOutput, context);
};
const de_ValidationException_event = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await parseBody(output.body, context),
    };
    return de_ValidationExceptionRes(parsedOutput, context);
};
/**
 * deserializeAws_restJson1PayloadPart
 */
const de_PayloadPart = (output, context) => {
    return (0, smithy_client_1.take)(output, {
        bytes: context.base64Decoder,
    });
};
const deserializeMetadata = (output) => ({
    httpStatusCode: output.statusCode,
    requestId: output.headers['x-amzn-requestid'] ??
        output.headers['x-amzn-request-id'] ??
        output.headers['x-amz-request-id'] ??
        '',
    extendedRequestId: output.headers['x-amz-id-2'] ?? '',
    cfId: output.headers['x-amz-cf-id'] ?? '',
});
// Encode Uint8Array data into string with utf-8.
const collectBodyString = (streamBody, context) => (0, smithy_client_1.collectBody)(streamBody, context).then((body) => context.utf8Encoder(body));
const parseBody = (streamBody, context) => collectBodyString(streamBody, context).then((encoded) => {
    if (encoded.length) {
        return JSON.parse(encoded);
    }
    return {};
});
//# sourceMappingURL=AWS_restJson1.js.map