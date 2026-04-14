import type { Provider, RetryErrorInfo, RetryStrategyV2, RetryToken, StandardRetryToken } from "@smithy/types";
import type { StandardRetryStrategyOptions } from "./StandardRetryStrategy";
import type { RateLimiter } from "./types";
/**
 * Strategy options to be passed to AdaptiveRetryStrategy
 *
 * @public
 */
export interface AdaptiveRetryStrategyOptions extends Partial<StandardRetryStrategyOptions> {
    rateLimiter?: RateLimiter;
}
/**
 * The AdaptiveRetryStrategy is a retry strategy for executing against a very
 * resource constrained set of resources. Care should be taken when using this
 * retry strategy. By default, it uses a dynamic backoff delay based on load
 * currently perceived against the downstream resource and performs circuit
 * breaking to disable retries in the event of high downstream failures using
 * the DefaultRateLimiter.
 *
 * @public
 *
 * @see {@link StandardRetryStrategy}
 * @see {@link DefaultRateLimiter }
 */
export declare class AdaptiveRetryStrategy implements RetryStrategyV2 {
    readonly mode: string;
    private rateLimiter;
    private standardRetryStrategy;
    constructor(maxAttemptsProvider: number | Provider<number>, options?: AdaptiveRetryStrategyOptions);
    acquireInitialRetryToken(retryTokenScope: string): Promise<RetryToken>;
    refreshRetryTokenForRetry(tokenToRenew: StandardRetryToken, errorInfo: RetryErrorInfo): Promise<RetryToken>;
    recordSuccess(token: StandardRetryToken): void;
    /**
     * There is an existing integration which accesses this field.
     * @deprecated
     */
    maxAttemptsProvider(): Promise<number>;
}
