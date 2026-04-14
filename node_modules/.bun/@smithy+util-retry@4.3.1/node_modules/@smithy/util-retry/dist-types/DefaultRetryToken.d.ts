import type { StandardRetryToken } from "@smithy/types";
/**
 * @internal
 */
export declare class DefaultRetryToken implements StandardRetryToken {
    private readonly delay;
    private readonly count;
    private readonly cost;
    private readonly longPoll;
    constructor(delay: number, count: number, cost: number | undefined, longPoll: boolean);
    getRetryCount(): number;
    getRetryDelay(): number;
    getRetryCost(): number | undefined;
    isLongPoll(): boolean;
}
