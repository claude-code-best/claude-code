import { INetworkModule, NetworkRequestOptions, NetworkResponse } from "@azure/msal-common/node";
/**
 * HTTP client implementation using Node.js native fetch API.
 *
 * This class provides a clean interface for making HTTP requests using the modern
 * fetch API available in Node.js 18+. It replaces the previous implementation that
 * relied on custom proxy handling and the legacy http/https modules.
 */
export declare class HttpClient implements INetworkModule {
    /**
     * Sends an HTTP GET request to the specified URL.
     *
     * This method handles GET requests with optional timeout support. The timeout
     * is implemented using AbortController, which provides a clean way to cancel
     * fetch requests that take too long to complete.
     *
     * @param url - The target URL for the GET request
     * @param options - Optional request configuration including headers
     * @param timeout - Optional timeout in milliseconds. If specified, the request
     *                  will be aborted if it doesn't complete within this time
     * @returns Promise that resolves to a NetworkResponse containing headers, body, and status
     * @throws {AuthError} When the request times out or response parsing fails
     * @throws {NetworkError} When the network request fails
     */
    sendGetRequestAsync<T>(url: string, options?: NetworkRequestOptions, timeout?: number): Promise<NetworkResponse<T>>;
    /**
     * Sends an HTTP POST request to the specified URL.
     *
     * This method handles POST requests with request body support. Currently,
     * timeout functionality is not exposed for POST requests, but the underlying
     * implementation supports it through the shared sendRequest method.
     *
     * @param url - The target URL for the POST request
     * @param options - Optional request configuration including headers and body
     * @returns Promise that resolves to a NetworkResponse containing headers, body, and status
     * @throws {AuthError} When the request times out or response parsing fails
     * @throws {NetworkError} When the network request fails
     */
    sendPostRequestAsync<T>(url: string, options?: NetworkRequestOptions): Promise<NetworkResponse<T>>;
    /**
     * Core HTTP request implementation using native fetch API.
     *
     * This method handles GET and POST HTTP requests with comprehensive
     * timeout support and error handling. The timeout mechanism works as follows:
     *
     * 1. An AbortController is created for each request
     * 2. If a timeout is specified, setTimeout is used to call abort() after the delay
     * 3. The abort signal is passed to fetch, which will reject the promise if aborted
     * 4. Cleanup occurs in both success and error cases to prevent timer leaks
     *
     * Error handling priority:
     * 1. Timeout errors (AbortError) are converted to "Request timeout" messages
     * 2. Network/connection errors are wrapped with "Network request failed" prefix
     * 3. JSON parsing errors are wrapped with "Failed to parse response" prefix
     *
     * @param url - The target URL for the request
     * @param method - HTTP method (GET or POST)
     * @param options - Optional request configuration (headers, body)
     * @param timeout - Optional timeout in milliseconds for request cancellation
     * @returns Promise resolving to NetworkResponse with parsed JSON body
     * @throws {AuthError} For timeouts or JSON parsing errors
     * @throws {NetworkError} For network failures
     */
    private sendRequest;
}
//# sourceMappingURL=HttpClient.d.ts.map