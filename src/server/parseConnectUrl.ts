/**
 * Parse a cc:// or cc+unix:// connect URL into server URL and auth token.
 *
 * Formats:
 *   cc://host:port?token=xxx        → http://host:port + xxx
 *   cc+unix:///path/to/socket?token=xxx → unix:///path/to/socket + xxx
 */
export function parseConnectUrl(url: string): {
  serverUrl: string
  authToken: string
  [key: string]: unknown
} {
  if (url.startsWith('cc+unix://')) {
    // cc+unix:///path/to/socket?token=xxx
    const withoutScheme = url.slice('cc+unix://'.length)
    const qIdx = withoutScheme.indexOf('?')
    const socketPath = qIdx >= 0 ? withoutScheme.slice(0, qIdx) : withoutScheme
    const params =
      qIdx >= 0
        ? new URLSearchParams(withoutScheme.slice(qIdx + 1))
        : new URLSearchParams()

    return {
      serverUrl: `unix://${socketPath}`,
      authToken: params.get('token') ?? '',
    }
  }

  if (url.startsWith('cc://')) {
    // cc://host:port?token=xxx
    // Replace cc:// with http:// for standard URL parsing
    const httpUrl = 'http://' + url.slice('cc://'.length)
    const parsed = new URL(httpUrl)

    return {
      serverUrl: `http://${parsed.host}`,
      authToken: parsed.searchParams.get('token') ?? '',
    }
  }

  // Fallback: try as-is
  return { serverUrl: url, authToken: '' }
}
