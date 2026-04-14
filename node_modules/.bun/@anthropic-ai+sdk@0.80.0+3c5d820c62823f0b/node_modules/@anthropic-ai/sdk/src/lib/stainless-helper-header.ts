/**
 * Shared utilities for tracking SDK helper usage.
 */

import type { BetaMessageParam, BetaToolUnion } from '../resources/beta';

/**
 * Symbol used to mark objects created by SDK helpers for tracking.
 * The value is the helper name (e.g., 'mcpTool', 'betaZodTool').
 */
export const SDK_HELPER_SYMBOL = Symbol('anthropic.sdk.stainlessHelper');

type StainlessHelperObject = { [SDK_HELPER_SYMBOL]: string };

export function wasCreatedByStainlessHelper(value: unknown): value is StainlessHelperObject {
  return typeof value === 'object' && value !== null && SDK_HELPER_SYMBOL in value;
}

/**
 * Collects helper names from tools and messages arrays.
 * Returns a deduplicated array of helper names found.
 */
export function collectStainlessHelpers(
  tools: BetaToolUnion[] | undefined,
  messages: BetaMessageParam[] | undefined,
): string[] {
  const helpers = new Set<string>();

  // Collect from tools
  if (tools) {
    for (const tool of tools) {
      if (wasCreatedByStainlessHelper(tool)) {
        helpers.add(tool[SDK_HELPER_SYMBOL]);
      }
    }
  }

  // Collect from messages and their content blocks
  if (messages) {
    for (const message of messages) {
      if (wasCreatedByStainlessHelper(message)) {
        helpers.add(message[SDK_HELPER_SYMBOL]);
      }

      if (Array.isArray(message.content)) {
        for (const block of message.content) {
          if (wasCreatedByStainlessHelper(block)) {
            helpers.add(block[SDK_HELPER_SYMBOL]);
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
export function stainlessHelperHeader(
  tools: BetaToolUnion[] | undefined,
  messages: BetaMessageParam[] | undefined,
): { 'x-stainless-helper'?: string } {
  const helpers = collectStainlessHelpers(tools, messages);
  if (helpers.length === 0) return {};
  return { 'x-stainless-helper': helpers.join(', ') };
}

/**
 * Builds x-stainless-helper header value from a file object.
 * Returns an empty object if the file is not marked with a helper.
 */
export function stainlessHelperHeaderFromFile(file: unknown): { 'x-stainless-helper'?: string } {
  if (wasCreatedByStainlessHelper(file)) {
    return { 'x-stainless-helper': file[SDK_HELPER_SYMBOL] };
  }
  return {};
}
