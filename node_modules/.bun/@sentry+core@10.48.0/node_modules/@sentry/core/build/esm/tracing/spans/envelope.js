import { dsnToString } from '../../utils/dsn.js';
import { getSdkMetadataForEnvelopeHeader, createEnvelope } from '../../utils/envelope.js';

/**
 * Creates a span v2 span streaming envelope
 */
function createStreamedSpanEnvelope(
  serializedSpans,
  dsc,
  client,
) {
  const dsn = client.getDsn();
  const tunnel = client.getOptions().tunnel;
  const sdk = getSdkMetadataForEnvelopeHeader(client.getOptions()._metadata);

  const headers = {
    sent_at: new Date().toISOString(),
    ...(dscHasRequiredProps(dsc) && { trace: dsc }),
    ...(sdk && { sdk }),
    ...(!!tunnel && dsn && { dsn: dsnToString(dsn) }),
  };

  const spanContainer = [
    { type: 'span', item_count: serializedSpans.length, content_type: 'application/vnd.sentry.items.span.v2+json' },
    { items: serializedSpans },
  ];

  return createEnvelope(headers, [spanContainer]);
}

function dscHasRequiredProps(dsc) {
  return !!dsc.trace_id && !!dsc.public_key;
}

export { createStreamedSpanEnvelope };
//# sourceMappingURL=envelope.js.map
