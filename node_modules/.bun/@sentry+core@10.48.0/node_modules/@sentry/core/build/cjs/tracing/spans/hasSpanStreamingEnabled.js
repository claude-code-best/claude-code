Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

/**
 * Determines if span streaming is enabled for the given client
 */
function hasSpanStreamingEnabled(client) {
  return client.getOptions().traceLifecycle === 'stream';
}

exports.hasSpanStreamingEnabled = hasSpanStreamingEnabled;
//# sourceMappingURL=hasSpanStreamingEnabled.js.map
