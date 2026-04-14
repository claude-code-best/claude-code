/**
 * Calculate a capped, fully-jittered exponential backoff time.
 * @internal
 * @deprecated replaced by \@smithy/util-retry (SRA).
 */
export declare const defaultDelayDecider: (delayBase: number, attempts: number) => number;
