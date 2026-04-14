export class Retry {
    static v2026 = typeof process !== "undefined" && process.env?.SMITHY_NEW_RETRIES_2026 === "true";
    static delay() {
        return Retry.v2026 ? 50 : 100;
    }
    static throttlingDelay() {
        return Retry.v2026 ? 1_000 : 500;
    }
    static cost() {
        return Retry.v2026 ? 14 : 5;
    }
    static throttlingCost() {
        return Retry.v2026 ? 5 : 10;
    }
    static modifiedCostType() {
        return Retry.v2026 ? "THROTTLING" : "TRANSIENT";
    }
}
