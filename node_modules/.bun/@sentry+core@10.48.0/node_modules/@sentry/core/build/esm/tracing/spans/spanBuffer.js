import { DEBUG_BUILD } from '../../debug-build.js';
import { debug } from '../../utils/debug-logger.js';
import { safeUnref } from '../../utils/timer.js';
import { getDynamicSamplingContextFromSpan } from '../dynamicSamplingContext.js';
import { createStreamedSpanEnvelope } from './envelope.js';
import { estimateSerializedSpanSizeInBytes } from './estimateSize.js';

/**
 * We must not send more than 1000 spans in one envelope.
 * Otherwise the envelope is dropped by Relay.
 */
const MAX_SPANS_PER_ENVELOPE = 1000;

const MAX_TRACE_WEIGHT_IN_BYTES = 5000000;

/**
 * A buffer for serialized streamed span JSON objects that flushes them to Sentry in Span v2 envelopes.
 * Handles per-trace timeout-based flushing, size thresholds, and graceful shutdown.
 * Also handles computation of the Dynamic Sampling Context (DSC) for the trace, if it wasn't yet
 * frozen onto the segment span.
 *
 * For this, we need the reference to the segment span instance, from
 * which we compute the DSC. Doing this in the buffer ensures that we compute the DSC as late as possible,
 * allowing span name and data updates up to this point. Worth noting here that the segment span is likely
 * still active and modifyable when child spans are added to the buffer.
 */
class SpanBuffer {
  /* Bucket spans by their trace id, along with accumulated size and a per-trace flush timeout */

   constructor(client, options) {
    this._traceBuckets = new Map();
    this._client = client;

    const { maxSpanLimit, flushInterval, maxTraceWeightInBytes } = options ?? {};

    this._maxSpanLimit =
      maxSpanLimit && maxSpanLimit > 0 && maxSpanLimit <= MAX_SPANS_PER_ENVELOPE
        ? maxSpanLimit
        : MAX_SPANS_PER_ENVELOPE;
    this._flushInterval = flushInterval && flushInterval > 0 ? flushInterval : 5000;
    this._maxTraceWeight =
      maxTraceWeightInBytes && maxTraceWeightInBytes > 0 ? maxTraceWeightInBytes : MAX_TRACE_WEIGHT_IN_BYTES;

    this._client.on('flush', () => {
      this.drain();
    });

    this._client.on('close', () => {
      // No need to drain the buffer here as `Client.close()` internally already calls `Client.flush()`
      // which already invokes the `flush` hook and thus drains the buffer.
      this._traceBuckets.forEach(bucket => {
        clearTimeout(bucket.timeout);
      });
      this._traceBuckets.clear();
    });
  }

  /**
   * Add a span to the buffer.
   */
   add(spanJSON) {
    const traceId = spanJSON.trace_id;
    let bucket = this._traceBuckets.get(traceId);

    if (!bucket) {
      bucket = {
        spans: new Set(),
        size: 0,
        timeout: safeUnref(
          setTimeout(() => {
            this.flush(traceId);
          }, this._flushInterval),
        ),
      };
      this._traceBuckets.set(traceId, bucket);
    }

    bucket.spans.add(spanJSON);
    bucket.size += estimateSerializedSpanSizeInBytes(spanJSON);

    if (bucket.spans.size >= this._maxSpanLimit || bucket.size >= this._maxTraceWeight) {
      this.flush(traceId);
    }
  }

  /**
   * Drain and flush all buffered traces.
   */
   drain() {
    if (!this._traceBuckets.size) {
      return;
    }

    DEBUG_BUILD && debug.log(`Flushing span tree map with ${this._traceBuckets.size} traces`);

    this._traceBuckets.forEach((_, traceId) => {
      this.flush(traceId);
    });
  }

  /**
   * Flush spans of a specific trace.
   * In contrast to {@link SpanBuffer.drain}, this method does not flush all traces, but only the one with the given traceId.
   */
   flush(traceId) {
    const bucket = this._traceBuckets.get(traceId);
    if (!bucket) {
      return;
    }

    if (!bucket.spans.size) {
      // we should never get here, given we always add a span when we create a new bucket
      // and delete the bucket once we flush out the trace
      this._removeTrace(traceId);
      return;
    }

    const spans = Array.from(bucket.spans);

    const segmentSpan = spans[0]?._segmentSpan;
    if (!segmentSpan) {
      DEBUG_BUILD && debug.warn('No segment span reference found on span JSON, cannot compute DSC');
      this._removeTrace(traceId);
      return;
    }

    const dsc = getDynamicSamplingContextFromSpan(segmentSpan);

    const cleanedSpans = spans.map(spanJSON => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { _segmentSpan, ...cleanSpanJSON } = spanJSON;
      return cleanSpanJSON;
    });

    const envelope = createStreamedSpanEnvelope(cleanedSpans, dsc, this._client);

    DEBUG_BUILD && debug.log(`Sending span envelope for trace ${traceId} with ${cleanedSpans.length} spans`);

    this._client.sendEnvelope(envelope).then(null, reason => {
      DEBUG_BUILD && debug.error('Error while sending streamed span envelope:', reason);
    });

    this._removeTrace(traceId);
  }

   _removeTrace(traceId) {
    const bucket = this._traceBuckets.get(traceId);
    if (bucket) {
      clearTimeout(bucket.timeout);
    }
    this._traceBuckets.delete(traceId);
  }
}

export { SpanBuffer };
//# sourceMappingURL=spanBuffer.js.map
