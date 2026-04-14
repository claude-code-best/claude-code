import { RawAttributes } from '../../attributes';
import { Client } from '../../client';
import { SerializedStreamedSpan, Span, StreamedSpanJSON } from '../../types-hoist/span';
export type SerializedStreamedSpanWithSegmentSpan = SerializedStreamedSpan & {
    _segmentSpan: Span;
};
/**
 * Captures a span and returns a JSON representation to be enqueued for sending.
 *
 * IMPORTANT: This function converts the span to JSON immediately to avoid writing
 * to an already-ended OTel span instance (which is blocked by the OTel Span class).
 *
 * @returns the final serialized span with a reference to its segment span. This reference
 * is needed later on to compute the DSC for the span envelope.
 */
export declare function captureSpan(span: Span, client: Client): SerializedStreamedSpanWithSegmentSpan;
/**
 * Apply a user-provided beforeSendSpan callback to a span JSON.
 */
export declare function applyBeforeSendSpanCallback(span: StreamedSpanJSON, beforeSendSpan: (span: StreamedSpanJSON) => StreamedSpanJSON): StreamedSpanJSON;
/**
 * Safely set attributes on a span JSON.
 * If an attribute already exists, it will not be overwritten.
 */
export declare function safeSetSpanJSONAttributes(spanJSON: StreamedSpanJSON, newAttributes: RawAttributes<Record<string, unknown>>): void;
//# sourceMappingURL=captureSpan.d.ts.map
