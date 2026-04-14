import type { RateLimiter } from "./types";
/**
 * @public
 */
export interface DefaultRateLimiterOptions {
    /**
     * Coefficient for controlling how aggressively the rate decreases on throttle.
     * @defaultValue 0.7
     */
    beta?: number;
    /**
     * Minimum token bucket capacity in adaptive-tokens.
     * @defaultValue 1
     */
    minCapacity?: number;
    /**
     * Minimum fill rate in adaptive-tokens per second.
     * @defaultValue 0.5
     */
    minFillRate?: number;
    /**
     * Scale constant used in the cubic rate calculation.
     * @defaultValue 0.4
     */
    scaleConstant?: number;
    /**
     * Smoothing factor for the exponential moving average of the measured send rate.
     * @defaultValue 0.8
     */
    smooth?: number;
}
/**
 * @public
 */
export declare class DefaultRateLimiter implements RateLimiter {
    /**
     * Only used in testing.
     */
    private static setTimeoutFn;
    private readonly beta;
    private readonly minCapacity;
    private readonly minFillRate;
    private readonly scaleConstant;
    private readonly smooth;
    /**
     * Whether adaptive retry rate limiting is active.
     * Remains `false` until a throttling error is detected.
     */
    private enabled;
    /**
     * Current number of available adaptive-tokens. When exhausted, requests wait based on fill rate.
     */
    private availableTokens;
    /**
     * The most recent maximum fill rate in adaptive-tokens per second, recorded at the last throttle event.
     */
    private lastMaxRate;
    /**
     * Smoothed measured send rate in requests per second.
     */
    private measuredTxRate;
    /**
     * Number of requests observed in the current measurement time bucket.
     */
    private requestCount;
    /**
     * Current token bucket fill rate in adaptive-tokens per second. Defaults to {@link minFillRate}.
     */
    private fillRate;
    /**
     * Timestamp in seconds of the most recent throttle event.
     */
    private lastThrottleTime;
    /**
     * Timestamp in seconds of the last token bucket refill.
     */
    private lastTimestamp;
    /**
     * The time bucket (in seconds) used for measuring the send rate.
     */
    private lastTxRateBucket;
    /**
     * Maximum token bucket capacity in adaptive-tokens. Defaults to {@link minCapacity}.
     * Updated in {@link updateTokenBucketRate} to match the new fill rate, floored by {@link minCapacity}.
     */
    private maxCapacity;
    /**
     * Calculated time window in seconds used in the cubic rate recovery function.
     */
    private timeWindow;
    constructor(options?: DefaultRateLimiterOptions);
    getSendToken(): Promise<void>;
    updateClientSendingRate(response: any): void;
    private getCurrentTimeInSeconds;
    private acquireTokenBucket;
    private refillTokenBucket;
    private calculateTimeWindow;
    /**
     * Returns a new fill rate in adaptive-tokens per second by reducing
     * the given rate by a factor of {@link beta}.
     */
    private cubicThrottle;
    /**
     * Returns a new fill rate in adaptive-tokens per second using a CUBIC
     * congestion control curve. The rate recovers toward {@link lastMaxRate},
     * then continues growing beyond it. The caller caps the result at
     * `2 * measuredTxRate`.
     */
    private cubicSuccess;
    private enableTokenBucket;
    /**
     * Set a new fill rate for adaptive-tokens.
     * The max capacity is updated to allow for one second of time to approximately
     * refill the adaptive-token capacity.
     */
    private updateTokenBucketRate;
    private updateMeasuredRate;
    private getPrecise;
}
