import { estimateTypedAttributesSizeInBytes } from '../../attributes.js';

/**
 * Estimates the serialized byte size of a {@link SerializedStreamedSpan}.
 *
 * Uses 2 bytes per character as a UTF-16 approximation, and 8 bytes per number.
 * The estimate is intentionally conservative and may be slightly lower than the
 * actual byte size on the wire.
 * We compensate for this by setting the span buffers internal limit well below the limit
 * of how large an actual span v2 envelope may be.
 */
function estimateSerializedSpanSizeInBytes(span) {
  /*
   * Fixed-size fields are pre-computed as a constant for performance:
   * - two timestamps (8 bytes each = 16)
   * - is_segment boolean (5 bytes, assumed false for most spans)
   * - trace_id  – always 32 hex chars (64 bytes)
   * - span_id   – always 16 hex chars (32 bytes)
   * - parent_span_id – 16 hex chars, assumed present for most spans (32 bytes)
   * - status "ok" – most common value (8 bytes)
   * = 156 bytes total base
   */
  let weight = 156;
  weight += span.name.length * 2;
  weight += estimateTypedAttributesSizeInBytes(span.attributes);
  if (span.links && span.links.length > 0) {
    // Assumption: Links are roughly equal in number of attributes
    // probably not always true but allows us to cut down on runtime
    const firstLink = span.links[0];
    const attributes = firstLink?.attributes;
    // Fixed size 100 due to span_id, trace_id and sampled flag (see above)
    const linkWeight = 100 + (attributes ? estimateTypedAttributesSizeInBytes(attributes) : 0);
    weight += linkWeight * span.links.length;
  }
  return weight;
}

export { estimateSerializedSpanSizeInBytes };
//# sourceMappingURL=estimateSize.js.map
