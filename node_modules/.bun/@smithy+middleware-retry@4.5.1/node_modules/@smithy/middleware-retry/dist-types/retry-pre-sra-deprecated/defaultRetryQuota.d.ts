import type { RetryQuota } from "./types";
/**
 * @internal
 * @deprecated replaced by \@smithy/util-retry (SRA).
 */
export interface DefaultRetryQuotaOptions {
    /**
     * The total amount of retry token to be incremented from retry token balance
     * if an SDK operation invocation succeeds without requiring a retry request.
     */
    noRetryIncrement?: number;
    /**
     * The total amount of retry tokens to be decremented from retry token balance.
     */
    retryCost?: number;
    /**
     * The total amount of retry tokens to be decremented from retry token balance
     * when a throttling error is encountered.
     */
    timeoutRetryCost?: number;
}
/**
 * @internal
 * @deprecated replaced by \@smithy/util-retry (SRA).
 */
export declare const getDefaultRetryQuota: (initialRetryTokens: number, options?: DefaultRetryQuotaOptions) => RetryQuota;
