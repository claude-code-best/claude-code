import {
  HandlerExecutionContext,
  InitializeHandler,
  InitializeHandlerOptions,
  MetadataBearer,
  Pluggable,
} from "@smithy/types";
export declare const longPollMiddleware: () => <
  Output extends MetadataBearer = MetadataBearer
>(
  next: InitializeHandler<any, Output>,
  context: HandlerExecutionContext
) => InitializeHandler<any, Output>;
export declare const longPollMiddlewareOptions: InitializeHandlerOptions;
export declare const getLongPollPlugin: (options: {}) => Pluggable<any, any>;
