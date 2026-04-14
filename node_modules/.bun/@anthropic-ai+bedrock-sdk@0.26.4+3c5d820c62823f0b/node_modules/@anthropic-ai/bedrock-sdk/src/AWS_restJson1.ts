// Copied from https://github.com/aws/aws-sdk-js-v3/blob/bee66fbd2a519a16b57c787b2689af857af720af/clients/client-bedrock-runtime/src/protocols/Aws_restJson1.ts
// Modified to remove unnecessary code (we only need to call `de_ResponseStream`) and to adjust imports.

// smithy-typescript generated code
import { HttpResponse as __HttpResponse } from '@smithy/protocol-http';
import {
  collectBody,
  decorateServiceException as __decorateServiceException,
  expectInt32 as __expectInt32,
  expectString as __expectString,
  map,
  take,
} from '@smithy/smithy-client';
import {
  EventStreamSerdeContext as __EventStreamSerdeContext,
  ResponseMetadata as __ResponseMetadata,
  SerdeContext as __SerdeContext,
} from '@smithy/types';

import {
  InternalServerException,
  ModelStreamErrorException,
  PayloadPart,
  ResponseStream,
  ThrottlingException,
  ValidationException,
} from '@aws-sdk/client-bedrock-runtime';

/**
 * deserializeAws_restJson1InternalServerExceptionRes
 */
const de_InternalServerExceptionRes = async (
  parsedOutput: any,
  context: __SerdeContext,
): Promise<InternalServerException> => {
  const contents: any = map({});
  const data: any = parsedOutput.body;
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
const de_ModelStreamErrorExceptionRes = async (
  parsedOutput: any,
  context: __SerdeContext,
): Promise<ModelStreamErrorException> => {
  const contents: any = map({});
  const data: any = parsedOutput.body;
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
const de_ThrottlingExceptionRes = async (
  parsedOutput: any,
  context: __SerdeContext,
): Promise<ThrottlingException> => {
  const contents: any = map({});
  const data: any = parsedOutput.body;
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
const de_ValidationExceptionRes = async (
  parsedOutput: any,
  context: __SerdeContext,
): Promise<ValidationException> => {
  const contents: any = map({});
  const data: any = parsedOutput.body;
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
export const de_ResponseStream = (
  output: any,
  context: __SerdeContext & __EventStreamSerdeContext,
): AsyncIterable<ResponseStream> => {
  return context.eventStreamMarshaller.deserialize(output, async (event) => {
    if (event['chunk'] != null) {
      return {
        chunk: await de_PayloadPart_event(event['chunk'], context),
      };
    }
    if (event['internalServerException'] != null) {
      return {
        internalServerException: await de_InternalServerException_event(
          event['internalServerException'],
          context,
        ),
      };
    }
    if (event['modelStreamErrorException'] != null) {
      return {
        modelStreamErrorException: await de_ModelStreamErrorException_event(
          event['modelStreamErrorException'],
          context,
        ),
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
const de_InternalServerException_event = async (
  output: any,
  context: __SerdeContext,
): Promise<InternalServerException> => {
  const parsedOutput: any = {
    ...output,
    body: await parseBody(output.body, context),
  };
  return de_InternalServerExceptionRes(parsedOutput, context);
};
const de_ModelStreamErrorException_event = async (
  output: any,
  context: __SerdeContext,
): Promise<ModelStreamErrorException> => {
  const parsedOutput: any = {
    ...output,
    body: await parseBody(output.body, context),
  };
  return de_ModelStreamErrorExceptionRes(parsedOutput, context);
};
const de_PayloadPart_event = async (output: any, context: __SerdeContext): Promise<PayloadPart> => {
  const contents: PayloadPart = {} as any;
  const data: any = await parseBody(output.body, context);
  Object.assign(contents, de_PayloadPart(data, context));
  return contents;
};
const de_ThrottlingException_event = async (
  output: any,
  context: __SerdeContext,
): Promise<ThrottlingException> => {
  const parsedOutput: any = {
    ...output,
    body: await parseBody(output.body, context),
  };
  return de_ThrottlingExceptionRes(parsedOutput, context);
};
const de_ValidationException_event = async (
  output: any,
  context: __SerdeContext,
): Promise<ValidationException> => {
  const parsedOutput: any = {
    ...output,
    body: await parseBody(output.body, context),
  };
  return de_ValidationExceptionRes(parsedOutput, context);
};
/**
 * deserializeAws_restJson1PayloadPart
 */
const de_PayloadPart = (output: any, context: __SerdeContext): PayloadPart => {
  return take(output, {
    bytes: context.base64Decoder,
  }) as any;
};

const deserializeMetadata = (output: __HttpResponse): __ResponseMetadata => ({
  httpStatusCode: output.statusCode,
  requestId:
    output.headers['x-amzn-requestid'] ??
    output.headers['x-amzn-request-id'] ??
    output.headers['x-amz-request-id'] ??
    '',
  extendedRequestId: output.headers['x-amz-id-2'] ?? '',
  cfId: output.headers['x-amz-cf-id'] ?? '',
});

// Encode Uint8Array data into string with utf-8.
const collectBodyString = (streamBody: any, context: __SerdeContext): Promise<string> =>
  collectBody(streamBody, context).then((body) => context.utf8Encoder(body));

const parseBody = (streamBody: any, context: __SerdeContext): any =>
  collectBodyString(streamBody, context).then((encoded) => {
    if (encoded.length) {
      return JSON.parse(encoded);
    }
    return {};
  });
