/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    AuthError,
    ClientAuthErrorCodes,
    INetworkModule,
    NetworkRequestOptions,
    NetworkResponse,
    createAuthError,
    createNetworkError,
} from "@azure/msal-common/node";
import { HttpMethod } from "../utils/Constants.js";

/**
 * HTTP client implementation using Node.js native fetch API.
 *
 * This class provides a clean interface for making HTTP requests using the modern
 * fetch API available in Node.js 18+. It replaces the previous implementation that
 * relied on custom proxy handling and the legacy http/https modules.
 */
export class HttpClient implements INetworkModule {
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
    async sendGetRequestAsync<T>(
        url: string,
        options?: NetworkRequestOptions,
        timeout?: number
    ): Promise<NetworkResponse<T>> {
        return this.sendRequest<T>(url, HttpMethod.GET, options, timeout);
    }

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
    async sendPostRequestAsync<T>(
        url: string,
        options?: NetworkRequestOptions
    ): Promise<NetworkResponse<T>> {
        return this.sendRequest<T>(url, HttpMethod.POST, options);
    }

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
    private async sendRequest<T>(
        url: string,
        method: string,
        options?: NetworkRequestOptions,
        timeout?: number
    ): Promise<NetworkResponse<T>> {
        /*
         * Setup timeout mechanism using AbortController
         * This provides a standard way to cancel fetch requests
         */
        const controller = new AbortController();
        let timeoutId: NodeJS.Timeout | undefined;

        /*
         * Configure timeout if specified
         * The setTimeout will trigger abort() if the request takes too long
         */
        if (timeout) {
            timeoutId = setTimeout(() => {
                // Calling abort() will cause fetch to reject with AbortError
                controller.abort();
            }, timeout);
        }

        const fetchOptions: RequestInit = {
            method: method,
            headers: getFetchHeaders(options),
            signal: controller.signal, // Enable cancellation via AbortController
        };

        if (method === HttpMethod.POST) {
            fetchOptions.body = options?.body || "";
        }

        let response: Response;
        try {
            response = await fetch(url, fetchOptions);
        } catch (error) {
            // Clean up timeout to prevent memory leaks
            if (timeoutId) {
                clearTimeout(timeoutId);
            }

            if (error instanceof Error && error.name === "AbortError") {
                throw createAuthError(
                    ClientAuthErrorCodes.networkError,
                    "Request timeout"
                );
            }

            const baseAuthError: AuthError = createAuthError(
                ClientAuthErrorCodes.networkError,
                `Network request failed: ${
                    error instanceof Error ? error.message : "unknown"
                }`
            );
            throw createNetworkError(
                baseAuthError,
                undefined,
                undefined,
                error instanceof Error ? error : undefined
            );
        }

        // Clean up timeout to prevent memory leaks
        if (timeoutId) {
            clearTimeout(timeoutId);
        }

        try {
            return {
                headers: getHeaderDict(response.headers),
                body: (await response.json()) as T,
                status: response.status,
            };
        } catch (error) {
            throw createAuthError(
                ClientAuthErrorCodes.tokenParsingError,
                `Failed to parse response: ${
                    error instanceof Error ? error.message : "unknown"
                }`
            );
        }
    }
}

/**
 * Converts a fetch Headers object to a plain JavaScript object.
 *
 * The fetch API returns headers as a Headers object with methods like get(), has(),
 * etc. However, the rest of the MSAL codebase expects headers as a simple key-value
 * object. This function performs that conversion.
 *
 * @param headers - The Headers object returned by fetch response
 * @returns A plain object with header names as keys and values as strings
 */
function getHeaderDict(headers: Headers): Record<string, string> {
    const headerDict: Record<string, string> = {};

    headers.forEach((value: string, key: string) => {
        headerDict[key] = value;
    });

    return headerDict;
}

/**
 * Converts NetworkRequestOptions headers to a fetch-compatible Headers object.
 *
 * The MSAL library uses plain objects for headers in NetworkRequestOptions,
 * but the fetch API expects either a Headers object, plain object, or array
 * of arrays. Using the Headers constructor provides better compatibility
 * and validation.
 *
 * @param options - Optional NetworkRequestOptions containing headers
 * @returns A Headers object ready for use with fetch API
 */
function getFetchHeaders(options?: NetworkRequestOptions): Headers {
    const headers = new Headers();

    if (!(options && options.headers)) {
        return headers;
    }

    Object.entries(options.headers).forEach(([key, value]) => {
        headers.append(key, value);
    });

    return headers;
}
