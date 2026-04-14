import type { HandlerExecutionContext, InitializeHandler, InitializeHandlerOptions, MetadataBearer, Pluggable } from "@smithy/types";
import type { RetryResolvedConfig } from "./configurations";
/**
 * This middleware is attached to operations designated as long-polling.
 * @internal
 */
export declare const longPollMiddleware: () => <Output extends MetadataBearer = MetadataBearer>(next: InitializeHandler<any, Output>, context: HandlerExecutionContext) => InitializeHandler<any, Output>;
/**
 * @internal
 */
export declare const longPollMiddlewareOptions: InitializeHandlerOptions;
/**
 * @internal
 */
export declare const getLongPollPlugin: (options: RetryResolvedConfig) => Pluggable<any, any>;
