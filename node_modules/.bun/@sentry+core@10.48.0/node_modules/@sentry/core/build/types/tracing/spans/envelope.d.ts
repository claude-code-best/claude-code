import type { Client } from '../../client';
import type { DynamicSamplingContext, StreamedSpanEnvelope } from '../../types-hoist/envelope';
import type { SerializedStreamedSpan } from '../../types-hoist/span';
/**
 * Creates a span v2 span streaming envelope
 */
export declare function createStreamedSpanEnvelope(serializedSpans: Array<SerializedStreamedSpan>, dsc: Partial<DynamicSamplingContext>, client: Client): StreamedSpanEnvelope;
//# sourceMappingURL=envelope.d.ts.map