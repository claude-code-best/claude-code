/**
 * Shared utilities for tracking SDK helper usage.
 */
import type { BetaMessageParam, BetaToolUnion } from "../resources/beta.js";
/**
 * Symbol used to mark objects created by SDK helpers for tracking.
 * The value is the helper name (e.g., 'mcpTool', 'betaZodTool').
 */
export declare const SDK_HELPER_SYMBOL: unique symbol;
type StainlessHelperObject = {
    [SDK_HELPER_SYMBOL]: string;
};
export declare function wasCreatedByStainlessHelper(value: unknown): value is StainlessHelperObject;
/**
 * Collects helper names from tools and messages arrays.
 * Returns a deduplicated array of helper names found.
 */
export declare function collectStainlessHelpers(tools: BetaToolUnion[] | undefined, messages: BetaMessageParam[] | undefined): string[];
/**
 * Builds x-stainless-helper header value from tools and messages.
 * Returns an empty object if no helpers are found.
 */
export declare function stainlessHelperHeader(tools: BetaToolUnion[] | undefined, messages: BetaMessageParam[] | undefined): {
    'x-stainless-helper'?: string;
};
/**
 * Builds x-stainless-helper header value from a file object.
 * Returns an empty object if the file is not marked with a helper.
 */
export declare function stainlessHelperHeaderFromFile(file: unknown): {
    'x-stainless-helper'?: string;
};
export {};
//# sourceMappingURL=stainless-helper-header.d.ts.map