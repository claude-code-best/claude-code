import { MAXIMUM_RETRY_DELAY } from "./constants";
import { Retry } from "./retries-2026-config";
export class DefaultRetryBackoffStrategy {
    x = Retry.delay();
    computeNextBackoffDelay(i) {
        const b = Math.random();
        const r = 2;
        const t_i = b * Math.min(this.x * r ** i, MAXIMUM_RETRY_DELAY);
        return Math.floor(t_i);
    }
    setDelayBase(delay) {
        this.x = delay;
    }
}
