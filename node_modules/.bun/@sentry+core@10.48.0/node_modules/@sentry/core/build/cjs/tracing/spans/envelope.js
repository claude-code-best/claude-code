Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const dsn = require('../../utils/dsn.js');
const envelope = require('../../utils/envelope.js');

/**
 * Creates a span v2 span streaming envelope
 */
function createStreamedSpanEnvelope(
  serializedSpans,
  dsc,
  client,
) {
  const dsn$1 = client.getDsn();
  const tunnel = client.getOptions().tunnel;
  const sdk = envelope.getSdkMetadataForEnvelopeHeader(client.getOptions()._metadata);

  const headers = {
    sent_at: new Date().toISOString(),
    ...(dscHasRequiredProps(dsc) && { trace: dsc }),
    ...(sdk && { sdk }),
    ...(!!tunnel && dsn$1 && { dsn: dsn.dsnToString(dsn$1) }),
  };

  const spanContainer = [
    { type: 'span', item_count: serializedSpans.length, content_type: 'application/vnd.sentry.items.span.v2+json' },
    { items: serializedSpans },
  ];

  return envelope.createEnvelope(headers, [spanContainer]);
}

function dscHasRequiredProps(dsc) {
  return !!dsc.trace_id && !!dsc.public_key;
}

exports.createStreamedSpanEnvelope = createStreamedSpanEnvelope;
//# sourceMappingURL=envelope.js.map
