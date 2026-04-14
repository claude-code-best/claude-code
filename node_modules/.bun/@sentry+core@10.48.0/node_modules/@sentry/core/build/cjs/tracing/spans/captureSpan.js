Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const semanticAttributes = require('../../semanticAttributes.js');
const scopeData = require('../../utils/scopeData.js');
const spanUtils = require('../../utils/spanUtils.js');
const utils = require('../utils.js');
const beforeSendSpan = require('./beforeSendSpan.js');

/**
 * Captures a span and returns a JSON representation to be enqueued for sending.
 *
 * IMPORTANT: This function converts the span to JSON immediately to avoid writing
 * to an already-ended OTel span instance (which is blocked by the OTel Span class).
 *
 * @returns the final serialized span with a reference to its segment span. This reference
 * is needed later on to compute the DSC for the span envelope.
 */
function captureSpan(span, client) {
  // Convert to JSON FIRST - we cannot write to an already-ended span
  const spanJSON = spanUtils.spanToStreamedSpanJSON(span);

  const segmentSpan = spanUtils.INTERNAL_getSegmentSpan(span);
  const serializedSegmentSpan = spanUtils.spanToStreamedSpanJSON(segmentSpan);

  const { isolationScope: spanIsolationScope, scope: spanScope } = utils.getCapturedScopesOnSpan(span);

  const finalScopeData = scopeData.getCombinedScopeData(spanIsolationScope, spanScope);

  applyCommonSpanAttributes(spanJSON, serializedSegmentSpan, client, finalScopeData);

  if (spanJSON.is_segment) {
    // Allow hook subscribers to mutate the segment span JSON
    client.emit('processSegmentSpan', spanJSON);
  }

  // Allow hook subscribers to mutate the span JSON
  client.emit('processSpan', spanJSON);

  const { beforeSendSpan: beforeSendSpan$1 } = client.getOptions();
  const processedSpan =
    beforeSendSpan$1 && beforeSendSpan.isStreamedBeforeSendSpanCallback(beforeSendSpan$1)
      ? applyBeforeSendSpanCallback(spanJSON, beforeSendSpan$1)
      : spanJSON;

  // Backfill sentry.span.source from sentry.source. Only `sentry.span.source` is respected by Sentry.
  // TODO(v11): Remove this backfill once we renamed SEMANTIC_ATTRIBUTE_SENTRY_SOURCE to sentry.span.source
  const spanNameSource = processedSpan.attributes?.[semanticAttributes.SEMANTIC_ATTRIBUTE_SENTRY_SOURCE];
  if (spanNameSource) {
    safeSetSpanJSONAttributes(processedSpan, {
      // Purposefully not using a constant defined here like in other attributes:
      // This will be the name for SEMANTIC_ATTRIBUTE_SENTRY_SOURCE in v11
      'sentry.span.source': spanNameSource,
    });
  }

  return {
    ...spanUtils.streamedSpanJsonToSerializedSpan(processedSpan),
    _segmentSpan: segmentSpan,
  };
}

function applyCommonSpanAttributes(
  spanJSON,
  serializedSegmentSpan,
  client,
  scopeData,
) {
  const sdk = client.getSdkMetadata();
  const { release, environment, sendDefaultPii } = client.getOptions();

  // avoid overwriting any previously set attributes (from users or potentially our SDK instrumentation)
  safeSetSpanJSONAttributes(spanJSON, {
    [semanticAttributes.SEMANTIC_ATTRIBUTE_SENTRY_RELEASE]: release,
    [semanticAttributes.SEMANTIC_ATTRIBUTE_SENTRY_ENVIRONMENT]: environment,
    [semanticAttributes.SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_NAME]: serializedSegmentSpan.name,
    [semanticAttributes.SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_ID]: serializedSegmentSpan.span_id,
    [semanticAttributes.SEMANTIC_ATTRIBUTE_SENTRY_SDK_NAME]: sdk?.sdk?.name,
    [semanticAttributes.SEMANTIC_ATTRIBUTE_SENTRY_SDK_VERSION]: sdk?.sdk?.version,
    ...(sendDefaultPii
      ? {
          [semanticAttributes.SEMANTIC_ATTRIBUTE_USER_ID]: scopeData.user?.id,
          [semanticAttributes.SEMANTIC_ATTRIBUTE_USER_EMAIL]: scopeData.user?.email,
          [semanticAttributes.SEMANTIC_ATTRIBUTE_USER_IP_ADDRESS]: scopeData.user?.ip_address,
          [semanticAttributes.SEMANTIC_ATTRIBUTE_USER_USERNAME]: scopeData.user?.username,
        }
      : {}),
    ...scopeData.attributes,
  });
}

/**
 * Apply a user-provided beforeSendSpan callback to a span JSON.
 */
function applyBeforeSendSpanCallback(
  span,
  beforeSendSpan,
) {
  const modifedSpan = beforeSendSpan(span);
  if (!modifedSpan) {
    spanUtils.showSpanDropWarning();
    return span;
  }
  return modifedSpan;
}

/**
 * Safely set attributes on a span JSON.
 * If an attribute already exists, it will not be overwritten.
 */
function safeSetSpanJSONAttributes(
  spanJSON,
  newAttributes,
) {
  const originalAttributes = spanJSON.attributes ?? (spanJSON.attributes = {});

  Object.entries(newAttributes).forEach(([key, value]) => {
    if (value != null && !(key in originalAttributes)) {
      originalAttributes[key] = value;
    }
  });
}

exports.applyBeforeSendSpanCallback = applyBeforeSendSpanCallback;
exports.captureSpan = captureSpan;
exports.safeSetSpanJSONAttributes = safeSetSpanJSONAttributes;
//# sourceMappingURL=captureSpan.js.map
