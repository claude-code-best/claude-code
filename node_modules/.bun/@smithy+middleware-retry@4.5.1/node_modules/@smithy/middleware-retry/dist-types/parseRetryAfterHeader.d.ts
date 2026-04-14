import type { Logger } from "@smithy/types";
/**
 * @internal
 */
export declare function parseRetryAfterHeader(response: unknown, logger?: Logger): Date | undefined;
/**
 * Backwards-compatibility alias.
 * @internal
 */
export declare function getRetryAfterHint(response: unknown, logger?: Logger): Date | undefined;
