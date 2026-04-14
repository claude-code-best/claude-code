import { parseBaggageHeader, SENTRY_BAGGAGE_KEY_PREFIX, objectToBaggageHeader } from '@sentry/core';

/**
 * Merge two baggage headers into one.
 * - Sentry-specific entries (keys starting with "sentry-") from the new baggage take precedence
 * - Non-Sentry entries from existing baggage take precedence
 * The order of the existing baggage will be preserved, and new entries will be added to the end.
 *
 * This matches the behavior of OTEL's propagation.inject() which uses baggage.setEntry()
 * to overwrite existing entries with the same key.
 */
function mergeBaggageHeaders(
  existing,
  baggage,
) {
  if (!existing) {
    return baggage;
  }

  const existingBaggageEntries = parseBaggageHeader(existing);
  const newBaggageEntries = parseBaggageHeader(baggage);

  if (!newBaggageEntries) {
    return existing;
  }

  // Single pass over new entries to partition sentry vs non-sentry
  const newSentryEntries = {};
  const newNonSentryEntries = {};
  for (const [key, value] of Object.entries(newBaggageEntries)) {
    if (key.startsWith(SENTRY_BAGGAGE_KEY_PREFIX)) {
      newSentryEntries[key] = value;
    } else {
      newNonSentryEntries[key] = value;
    }
  }

  const hasNewSentryEntries = Object.keys(newSentryEntries).length > 0;

  // If new baggage contains at least one sentry- value, we remove all old sentry- values
  // otherwise, we keep old sentry- values. If we don't remove old sentry- values, we end
  // up with an inconsistent dynamic sampling context propagation.
  const mergedBaggageEntries = {};
  if (existingBaggageEntries) {
    for (const [key, value] of Object.entries(existingBaggageEntries)) {
      if (hasNewSentryEntries && key.startsWith(SENTRY_BAGGAGE_KEY_PREFIX)) {
        continue;
      }
      mergedBaggageEntries[key] = value;
    }
  }

  // Sentry entries from new baggage always overwrite; non-sentry only if not already present
  Object.assign(mergedBaggageEntries, newSentryEntries);
  for (const [key, value] of Object.entries(newNonSentryEntries)) {
    if (!mergedBaggageEntries[key]) {
      mergedBaggageEntries[key] = value;
    }
  }

  return objectToBaggageHeader(mergedBaggageEntries);
}

export { mergeBaggageHeaders };
//# sourceMappingURL=baggage.js.map
