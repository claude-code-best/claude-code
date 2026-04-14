import type { StandardRetryBackoffStrategy } from "@smithy/types";
/**
 * @internal
 */
export declare class DefaultRetryBackoffStrategy implements StandardRetryBackoffStrategy {
    protected x: number;
    /**
     * @param i - attempt count starting from zero.
     */
    computeNextBackoffDelay(i: number): number;
    setDelayBase(delay: number): void;
}
