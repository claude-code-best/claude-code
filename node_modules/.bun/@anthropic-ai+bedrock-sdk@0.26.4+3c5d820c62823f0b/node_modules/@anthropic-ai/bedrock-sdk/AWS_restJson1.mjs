// Copied from https://github.com/aws/aws-sdk-js-v3/blob/bee66fbd2a519a16b57c787b2689af857af720af/clients/client-bedrock-runtime/src/protocols/Aws_restJson1.ts
// Modified to remove unnecessary code (we only need to call `de_ResponseStream`) and to adjust imports.
import { collectBody, decorateServiceException as __decorateServiceException, expectInt32 as __expectInt32, expectString as __expectString, map, take, } from '@smithy/smithy-client';
import { InternalServerException, ModelStreamErrorException, ThrottlingException, ValidationException, } from '@aws-sdk/client-bedrock-runtime';
/**
 * deserializeAws_restJson1InternalServerExceptionRes
 */
const de_InternalServerExceptionRes = async (parsedOutput, context) => {
    const contents = map({});
    const data = parsedOutput.body;
    const doc = take(data, {
        message: __expectString,
    });
    Object.assign(contents, doc);
    const exception = new InternalServerException({
        $metadata: deserializeMetadata(parsedOutput),
        ...contents,
    });
    return __decorateServiceException(exception, parsedOutput.body);
};
/**
 * deserializeAws_restJson1ModelStreamErrorExceptionRes
 */
const de_ModelStreamErrorExceptionRes = async (parsedOutput, context) => {
    const contents = map({});
    const data = parsedOutput.body;
    const doc = take(data, {
        message: __expectString,
        originalMessage: __expectString,
        originalStatusCode: __expectInt32,
    });
    Object.assign(contents, doc);
    const exception = new ModelStreamErrorException({
        $metadata: deserializeMetadata(parsedOutput),
        ...contents,
    });
    return __decorateServiceException(exception, parsedOutput.body);
};
/**
 * deserializeAws_restJson1ThrottlingExceptionRes
 */
const de_ThrottlingExceptionRes = async (parsedOutput, context) => {
    const contents = map({});
    const data = parsedOutput.body;
    const doc = take(data, {
        message: __expectString,
    });
    Object.assign(contents, doc);
    const exception = new ThrottlingException({
        $metadata: deserializeMetadata(parsedOutput),
        ...contents,
    });
    return __decorateServiceException(exception, parsedOutput.body);
};
/**
 * deserializeAws_restJson1ValidationExceptionRes
 */
const de_ValidationExceptionRes = async (parsedOutput, context) => {
    const contents = map({});
    const data = parsedOutput.body;
    const doc = take(data, {
        message: __expectString,
    });
    Object.assign(contents, doc);
    const exception = new ValidationException({
        $metadata: deserializeMetadata(parsedOutput),
        ...contents,
    });
    return __decorateServiceException(exception, parsedOutput.body);
};
/**
 * deserializeAws_restJson1ResponseStream
 */
export const de_ResponseStream = (output, context) => {
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
    return take(output, {
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
const collectBodyString = (streamBody, context) => collectBody(streamBody, context).then((body) => context.utf8Encoder(body));
const parseBody = (streamBody, context) => collectBodyString(streamBody, context).then((encoded) => {
    if (encoded.length) {
        return JSON.parse(encoded);
    }
    return {};
});
//# sourceMappingURL=AWS_restJson1.mjs.map