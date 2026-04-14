"use strict";
/**
 * Shared utilities for tracking SDK helper usage.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SDK_HELPER_SYMBOL = void 0;
exports.wasCreatedByStainlessHelper = wasCreatedByStainlessHelper;
exports.collectStainlessHelpers = collectStainlessHelpers;
exports.stainlessHelperHeader = stainlessHelperHeader;
exports.stainlessHelperHeaderFromFile = stainlessHelperHeaderFromFile;
/**
 * Symbol used to mark objects created by SDK helpers for tracking.
 * The value is the helper name (e.g., 'mcpTool', 'betaZodTool').
 */
exports.SDK_HELPER_SYMBOL = Symbol('anthropic.sdk.stainlessHelper');
function wasCreatedByStainlessHelper(value) {
    return typeof value === 'object' && value !== null && exports.SDK_HELPER_SYMBOL in value;
}
/**
 * Collects helper names from tools and messages arrays.
 * Returns a deduplicated array of helper names found.
 */
function collectStainlessHelpers(tools, messages) {
    const helpers = new Set();
    // Collect from tools
    if (tools) {
        for (const tool of tools) {
            if (wasCreatedByStainlessHelper(tool)) {
                helpers.add(tool[exports.SDK_HELPER_SYMBOL]);
            }
        }
    }
    // Collect from messages and their content blocks
    if (messages) {
        for (const message of messages) {
            if (wasCreatedByStainlessHelper(message)) {
                helpers.add(message[exports.SDK_HELPER_SYMBOL]);
            }
            if (Array.isArray(message.content)) {
                for (const block of message.content) {
                    if (wasCreatedByStainlessHelper(block)) {
                        helpers.add(block[exports.SDK_HELPER_SYMBOL]);
                    }
                }
            }
        }
    }
    return Array.from(helpers);
}
/**
 * Builds x-stainless-helper header value from tools and messages.
 * Returns an empty object if no helpers are found.
 */
function stainlessHelperHeader(tools, messages) {
    const helpers = collectStainlessHelpers(tools, messages);
    if (helpers.length === 0)
        return {};
    return { 'x-stainless-helper': helpers.join(', ') };
}
/**
 * Builds x-stainless-helper header value from a file object.
 * Returns an empty object if the file is not marked with a helper.
 */
function stainlessHelperHeaderFromFile(file) {
    if (wasCreatedByStainlessHelper(file)) {
        return { 'x-stainless-helper': file[exports.SDK_HELPER_SYMBOL] };
    }
    return {};
}
//# sourceMappingURL=stainless-helper-header.js.map