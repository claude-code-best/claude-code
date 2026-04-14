/**
 * Determines if span streaming is enabled for the given client
 */
function hasSpanStreamingEnabled(client) {
  return client.getOptions().traceLifecycle === 'stream';
}

export { hasSpanStreamingEnabled };
//# sourceMappingURL=hasSpanStreamingEnabled.js.map
