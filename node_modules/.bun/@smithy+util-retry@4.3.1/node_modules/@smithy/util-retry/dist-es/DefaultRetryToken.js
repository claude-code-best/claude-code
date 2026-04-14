import { MAXIMUM_RETRY_DELAY } from "./constants";
export class DefaultRetryToken {
    delay;
    count;
    cost;
    longPoll;
    constructor(delay, count, cost, longPoll) {
        this.delay = delay;
        this.count = count;
        this.cost = cost;
        this.longPoll = longPoll;
    }
    getRetryCount() {
        return this.count;
    }
    getRetryDelay() {
        return Math.min(MAXIMUM_RETRY_DELAY, this.delay);
    }
    getRetryCost() {
        return this.cost;
    }
    isLongPoll() {
        return this.longPoll;
    }
}
