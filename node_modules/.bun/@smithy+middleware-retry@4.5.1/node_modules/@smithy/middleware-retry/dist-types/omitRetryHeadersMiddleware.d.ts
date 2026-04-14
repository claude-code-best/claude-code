import type { FinalizeHandler, MetadataBearer, Pluggable, RelativeMiddlewareOptions } from "@smithy/types";
/**
 * This is still in use.
 * See AddOmitRetryHeadersDependency.java.
 * @internal
 */
export declare const omitRetryHeadersMiddleware: () => <Output extends MetadataBearer = MetadataBearer>(next: FinalizeHandler<any, Output>) => FinalizeHandler<any, Output>;
/**
 * @internal
 */
export declare const omitRetryHeadersMiddlewareOptions: RelativeMiddlewareOptions;
/**
 * @internal
 */
export declare const getOmitRetryHeadersPlugin: (options: unknown) => Pluggable<any, any>;
