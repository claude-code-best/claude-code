import { invoke, invokeAsync, RequestParameterBuilder, ICrypto, IPerformanceClient, Logger, CommonAuthorizationUrlRequest, CommonEndSessionRequest } from "@azure/msal-common/browser";
import { BrowserConfiguration, BrowserExperimentalOptions } from "../config/Configuration.js";
/**
 * Extracts and parses the authentication response from URL (hash and/or query string).
 * This is a shared utility used across multiple components in msal-browser.
 *
 * @returns {Object} An object containing the parsed state information and URL parameters.
 * @returns {URLSearchParams} params - The parsed URL parameters from the payload.
 * @returns {string} payload - The combined query string and hash content.
 * @returns {string} urlHash - The original URL hash.
 * @returns {string} urlQuery - The original URL query string.
 * @returns {LibraryStateObject} libraryState - The decoded library state from the state parameter.
 *
 * @throws {AuthError} If no authentication payload is found in the URL.
 * @throws {AuthError} If the state parameter is missing.
 * @throws {AuthError} If the state is missing required 'id' or 'meta' attributes.
 */
export declare function parseAuthResponseFromUrl(): {
    params: URLSearchParams;
    payload: string;
    urlHash: string;
    urlQuery: string;
    hasResponseInHash: boolean;
    hasResponseInQuery: boolean;
    libraryState: {
        id: string;
        meta: Record<string, string>;
    };
};
/**
 * Clears hash from window url.
 */
export declare function clearHash(contentWindow: Window): void;
/**
 * Replaces current hash with hash from provided url
 */
export declare function replaceHash(url: string): void;
/**
 * Returns boolean of whether the current window is in an iframe or not.
 */
export declare function isInIframe(): boolean;
/**
 * Returns boolean of whether or not the current window is a popup opened by msal
 */
export declare function isInPopup(): boolean;
/**
 * Cancels the pending bridge response monitor if one exists.
 * This is called when overrideInteractionInProgress is used to cancel
 * any pending popup interaction before starting a new one.
 */
export declare function cancelPendingBridgeResponse(logger: Logger, correlationId: string): void;
export declare function waitForBridgeResponse(timeoutMs: number, logger: Logger, browserCrypto: ICrypto, request: CommonAuthorizationUrlRequest | CommonEndSessionRequest, performanceClient: IPerformanceClient, experimentalConfig?: BrowserExperimentalOptions): Promise<string>;
/**
 * Returns current window URL as redirect uri
 */
export declare function getCurrentUri(): string;
/**
 * Gets the homepage url for the current window location.
 */
export declare function getHomepage(): string;
/**
 * Throws error if we have completed an auth and are
 * attempting another auth request inside an iframe.
 */
export declare function blockReloadInHiddenIframes(): void;
/**
 * Block redirect operations in iframes unless explicitly allowed
 * @param interactionType Interaction type for the request
 * @param allowRedirectInIframe Config value to allow redirects when app is inside an iframe
 */
export declare function blockRedirectInIframe(allowRedirectInIframe: boolean): void;
/**
 * Block redirectUri loaded in popup from calling AcquireToken APIs
 */
export declare function blockAcquireTokenInPopups(): void;
/**
 * Throws error if token requests are made in non-browser environment
 * @param isBrowserEnvironment Flag indicating if environment is a browser.
 */
export declare function blockNonBrowserEnvironment(): void;
/**
 * Throws error if initialize hasn't been called
 * @param initialized
 */
export declare function blockAPICallsBeforeInitialize(initialized: boolean): void;
/**
 * Helper to validate app environment before making an auth request
 * @param initialized
 */
export declare function preflightCheck(initialized: boolean): void;
/**
 * Helper to validate app enviornment before making redirect request
 * @param initialized
 * @param config
 */
export declare function redirectPreflightCheck(initialized: boolean, config: BrowserConfiguration): void;
/**
 * Adds a preconnect link element to the header which begins DNS resolution and SSL connection in anticipation of the /token request
 * @param loginDomain Authority domain, including https protocol e.g. https://login.microsoftonline.com
 * @returns
 */
export declare function preconnect(authority: string): void;
/**
 * Wrapper function that creates a UUID v7 from the current timestamp.
 * @returns {string}
 */
export declare function createGuid(): string;
export { invoke };
export { invokeAsync };
export declare const addClientCapabilitiesToClaims: typeof RequestParameterBuilder.addClientCapabilitiesToClaims;
//# sourceMappingURL=BrowserUtils.d.ts.map