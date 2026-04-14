import { getClient, shouldPropagateTraceForUrl, getTraceData, getBreadcrumbLogLevelFromHttpStatusCode, addBreadcrumb, debug, parseUrl, getSanitizedUrlString } from '@sentry/core';
import { mergeBaggageHeaders } from './baggage.js';

const SENTRY_TRACE_HEADER = 'sentry-trace';
const SENTRY_BAGGAGE_HEADER = 'baggage';
const W3C_TRACEPARENT_HEADER = 'traceparent';
/**
 * Add trace propagation headers to an outgoing fetch/undici request.
 *
 * Checks if the request URL matches trace propagation targets,
 * then injects sentry-trace, traceparent, and baggage headers.
 */
// eslint-disable-next-line complexity
function addTracePropagationHeadersToFetchRequest(
  request,
  propagationDecisionMap,
) {
  const url = getAbsoluteUrl(request.origin, request.path);

  // Manually add the trace headers, if it applies
  // Note: We do not use `propagation.inject()` here, because our propagator relies on an active span
  // Which we do not have in this case
  // The propagator _may_ overwrite this, but this should be fine as it is the same data
  const { tracePropagationTargets, propagateTraceparent } = getClient()?.getOptions() || {};
  const addedHeaders = shouldPropagateTraceForUrl(url, tracePropagationTargets, propagationDecisionMap)
    ? getTraceData({ propagateTraceparent })
    : undefined;

  if (!addedHeaders) {
    return;
  }

  const { 'sentry-trace': sentryTrace, baggage, traceparent } = addedHeaders;

  const requestHeaders = Array.isArray(request.headers) ? request.headers : stringToArrayHeaders(request.headers);

  // OTel's UndiciInstrumentation calls propagation.inject() which unconditionally
  // appends headers to the request. When the user also sets headers via getTraceData(),
  // this results in duplicate sentry-trace and baggage (and optionally traceparent) entries.
  // We clean these up before applying our own logic.
  _deduplicateArrayHeader(requestHeaders, SENTRY_TRACE_HEADER);
  _deduplicateArrayHeader(requestHeaders, SENTRY_BAGGAGE_HEADER);
  if (propagateTraceparent) {
    _deduplicateArrayHeader(requestHeaders, W3C_TRACEPARENT_HEADER);
  }

  // We do not want to overwrite existing headers here
  // If the core UndiciInstrumentation is registered, it will already have set the headers
  // We do not want to add any then
  const hasExistingSentryTraceHeader = _findExistingHeaderIndex(requestHeaders, SENTRY_TRACE_HEADER) !== -1;

  // We do not want to set any headers if we already have an existing sentry-trace header.
  // sentry-trace is still the source of truth, otherwise we risk mixing up baggage and sentry-trace values.
  if (!hasExistingSentryTraceHeader) {
    if (sentryTrace) {
      requestHeaders.push(SENTRY_TRACE_HEADER, sentryTrace);
    }

    if (traceparent && _findExistingHeaderIndex(requestHeaders, 'traceparent') === -1) {
      requestHeaders.push('traceparent', traceparent);
    }

    // For baggage, we make sure to merge this into a possibly existing header
    const existingBaggageIndex = _findExistingHeaderIndex(requestHeaders, SENTRY_BAGGAGE_HEADER);
    if (baggage && existingBaggageIndex === -1) {
      requestHeaders.push(SENTRY_BAGGAGE_HEADER, baggage);
    } else if (baggage) {
      // headers in format [key_0, value_0, key_1, value_1, ...], hence the +1 here
      const existingBaggageValue = requestHeaders[existingBaggageIndex + 1];
      const merged = mergeBaggageHeaders(existingBaggageValue, baggage);
      if (merged) {
        requestHeaders[existingBaggageIndex + 1] = merged;
      }
    }
  }

  if (!Array.isArray(request.headers)) {
    // For original string request headers, we need to write them back to the request
    request.headers = arrayToStringHeaders(requestHeaders);
  }
}

function stringToArrayHeaders(requestHeaders) {
  const headersArray = requestHeaders.split('\r\n');
  const headers = [];
  for (const header of headersArray) {
    try {
      const colonIndex = header.indexOf(':');
      if (colonIndex === -1) {
        continue;
      }
      const key = header.slice(0, colonIndex).trim();
      const value = header.slice(colonIndex + 1).trim();
      if (key) {
        headers.push(key, value);
      }
    } catch {
      debug.warn(`Failed to convert string request header to array header: ${header}`);
    }
  }
  return headers;
}

function arrayToStringHeaders(headers) {
  const headerPairs = [];

  for (let i = 0; i < headers.length; i += 2) {
    const key = headers[i];
    const value = headers[i + 1];
    if (!key || value == null) {
      // skip falsy keys but only null/undefined values
      continue;
    }
    headerPairs.push(`${key}: ${value}`);
  }

  if (!headerPairs.length) {
    return '';
  }

  return headerPairs.join('\r\n').concat('\r\n');
}

/**
 * For a given header name, if there are multiple entries in the [key, value, key, value, ...] array,
 * keep the first entry and remove the rest.
 * For baggage, values are merged to preserve all entries but to dedupe sentry- values, and always
 * keep the first occurrence of them
 */
function _deduplicateArrayHeader(headers, headerName) {
  let firstIndex = -1;
  for (let i = 0; i < headers.length; i += 2) {
    if (headers[i] !== headerName) {
      continue;
    }

    if (firstIndex === -1) {
      firstIndex = i;
      continue;
    }

    const firstHeaderValue = headers[firstIndex + 1];
    if (headerName === SENTRY_BAGGAGE_HEADER && firstHeaderValue) {
      // mergeBaggageHeaders always takes sentry- values from the new baggage (2nd param) and merges
      // it with the existing one (1st param). Here, we want to keep the first header's existing
      // sentry- values in favor of the new ones. Hence we swap the parameters.
      const merged = mergeBaggageHeaders(headers[i + 1], firstHeaderValue);
      if (merged) {
        headers[firstIndex + 1] = merged;
      }
    }
    headers.splice(i, 2);
    i -= 2;
  }
}

/**
 * Find the index of an existing header in an array of headers.
 * Only take even indices, because headers are in format [key_0, value_0, key_1, value_1, ...]
 * otherwise we could match a header _value_ with @param name
 */
function _findExistingHeaderIndex(headers, name) {
  return headers.findIndex((header, i) => i % 2 === 0 && header === name);
}

/** Add a breadcrumb for an outgoing fetch/undici request. */
function addFetchRequestBreadcrumb(request, response) {
  const data = getBreadcrumbData(request);

  const statusCode = response.statusCode;
  const level = getBreadcrumbLogLevelFromHttpStatusCode(statusCode);

  addBreadcrumb(
    {
      category: 'http',
      data: {
        status_code: statusCode,
        ...data,
      },
      type: 'http',
      level,
    },
    {
      event: 'response',
      request,
      response,
    },
  );
}

function getBreadcrumbData(request) {
  try {
    const url = getAbsoluteUrl(request.origin, request.path);
    const parsedUrl = parseUrl(url);

    const data = {
      url: getSanitizedUrlString(parsedUrl),
      'http.method': request.method || 'GET',
    };

    if (parsedUrl.search) {
      data['http.query'] = parsedUrl.search;
    }
    if (parsedUrl.hash) {
      data['http.fragment'] = parsedUrl.hash;
    }

    return data;
  } catch {
    return {};
  }
}

/** Get the absolute URL from an origin and path. */
function getAbsoluteUrl(origin, path = '/') {
  try {
    const url = new URL(path, origin);
    return url.toString();
  } catch {
    // fallback: Construct it on our own
    const url = `${origin}`;

    if (url.endsWith('/') && path.startsWith('/')) {
      return `${url}${path.slice(1)}`;
    }

    if (!url.endsWith('/') && !path.startsWith('/')) {
      return `${url}/${path}`;
    }

    return `${url}${path}`;
  }
}

export { addFetchRequestBreadcrumb, addTracePropagationHeadersToFetchRequest, getAbsoluteUrl };
//# sourceMappingURL=outgoingFetchRequest.js.map
